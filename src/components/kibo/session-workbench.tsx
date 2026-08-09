import * as React from "react";
import { History, Mic, Pause, Play, Settings, Square, X, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import { makeTurn } from "@/lib/kibo/mock";
import type { Candidate, Lifecycle, Round, Turn } from "@/lib/kibo/types";
import { useTranscriber } from "@/lib/kibo/use-transcriber";
import { summarizeSession, translateLine } from "@/lib/kibo/ai.functions";
import { streamSuggestions } from "@/lib/kibo/suggest-stream";
import { loadVoiceprint } from "@/lib/kibo/voiceprint";

import { MemoSuggestionStage as SuggestionStage } from "./suggestion-stage";
import { SettingsSheet } from "./settings-sheet";
import { HistorySheet } from "./history-sheet";
import { UiLanguageMenu } from "./ui-language-menu";
import { AccountMenu } from "./account-menu";

const uid = () => Math.random().toString(36).slice(2, 10);


const copy = {
  zh: {
    micDenied: "无法访问麦克风，请在浏览器中允许麦克风权限后重试。",
    screenDenied: "未能获取系统音频，请在共享对话框中勾选“分享标签页/系统音频”。",
    failed: "语音转写失败：",
    live: "正在听写…",
    enrollTitle: "先录入你的声纹",
    enrollBody: "录入后系统才能在对话中分清哪句是你说的。只需 6 秒，数据只保存在本机。",
    enrollCta: "去录入",
    dismiss: "稍后再说",
  },
  ja: {
    micDenied: "マイクにアクセスできません。ブラウザでマイクを許可してからもう一度お試しください。",
    screenDenied: "システム音声を取得できませんでした。共有ダイアログで「音声を共有」を有効にしてください。",
    failed: "文字起こしに失敗しました：",
    live: "書き起こし中…",
    enrollTitle: "まず声紋を登録しましょう",
    enrollBody: "登録すると会話中にあなたの発言を判別できます。約6秒、データは端末内のみに保存されます。",
    enrollCta: "登録する",
    dismiss: "あとで",
  },
  en: {
    micDenied: "Microphone access failed. Allow microphone permission and try again.",
    screenDenied: "System audio was not shared. Enable “share audio” in the sharing dialog.",
    failed: "Transcription failed: ",
    live: "Transcribing…",
    enrollTitle: "Enroll your voiceprint first",
    enrollBody: "It lets the app tell your speech apart during a conversation. Takes 6 seconds and stays on this device.",
    enrollCta: "Enroll now",
    dismiss: "Later",
  },
} as const;


export function SessionWorkbench() {
  const { prefs, t, addSession, user } = useKibo();
  const [voiceprintReady, setVoiceprintReady] = React.useState(true);
  const [enrollDismissed, setEnrollDismissed] = React.useState(false);

  React.useEffect(() => {
    const sync = () => setVoiceprintReady(loadVoiceprint() !== null);
    sync();
    window.addEventListener("kibo:voiceprint", sync);
    return () => window.removeEventListener("kibo:voiceprint", sync);
  }, []);
  const [life, setLife] = React.useState<Lifecycle>("idle");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [aiStatus, setAiStatus] = React.useState<
    "idle" | "connecting" | "retrying" | "streaming" | "done" | "error"
  >("idle");
  const [aiError, setAiError] = React.useState("");
  const [aiAttempt, setAiAttempt] = React.useState(0);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [confirmStop, setConfirmStop] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(0);
  const [interim, setInterim] = React.useState<{ user: string; other: string }>({
    user: "",
    other: "",
  });
  const [error, setError] = React.useState("");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const words = copy[prefs.uiLang] ?? copy.en;

  const turnsRef = React.useRef<Turn[]>([]);
  turnsRef.current = turns;
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const reqRef = React.useRef(0);
  const abortRef = React.useRef<AbortController | null>(null);

  /** The user talking over the coach makes the in-flight suggestion stale. */
  const cancelSuggestions = React.useCallback(() => {
    if (!abortRef.current) return;
    reqRef.current += 1;
    abortRef.current.abort();
    abortRef.current = null;
    setStreaming(false);
    setAiStatus("idle");
    setAiError("");
    // A round that never produced text would linger as an empty card.
    setRounds((prev) => (prev[0] && prev[0].candidates.length === 0 ? prev.slice(1) : prev));
  }, []);


  const handleInterim = React.useCallback(
    (text: string, speaker: "user" | "other") => {
      if (speaker === "user" && text.trim().length > 1) cancelSuggestions();
      setInterim((prev) => ({ ...prev, [speaker]: text }));
    },
    [cancelSuggestions],
  );

  type SuggestPayload = {
    turns: { speaker: "user" | "other"; text: string }[];
    conversationLang: string;
    uiLang: string;
    level: string;
  };
  /** The exact prompt + context of the last attempt, so a retry replays it. */
  const lastRequestRef = React.useRef<{ text: string; payload: SuggestPayload } | null>(null);

  /** Kick off a suggestion stream for one incoming line, tracking its status. */
  const runSuggestions = React.useCallback(
    (text: string, replay?: SuggestPayload) => {
      const req = ++reqRef.current;
      const roundId = uid();
      // A new turn makes the in-flight suggestion obsolete — cancel it.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setStreaming(true);
      setAiError("");
      setAiStatus(replay ? "retrying" : "connecting");
      setAiAttempt((n) => (replay ? n + 1 : 0));
      // Insert an empty round immediately, then fill it in as tokens arrive.
      setRounds((prev) => [{ id: roundId, prompt: text, candidates: [] }, ...prev]);

      const onUpdate = (candidates: Candidate[]) => {
        if (req !== reqRef.current) return;
        setAiStatus((s) => (s === "connecting" || s === "retrying" ? "streaming" : s));
        setRounds((prev) => {
          // The streaming round is always the head; patch it in place.
          if (prev[0]?.id !== roundId) return prev;
          const next = prev.slice();
          next[0] = { ...prev[0], candidates };
          return next;
        });
      };

      // Retries replay the captured context verbatim; fresh turns snapshot it now.
      const payload: SuggestPayload =
        replay ?? {
          turns: turnsRef.current.map((x) => ({ speaker: x.speaker, text: x.text })),
          conversationLang: prefsRef.current.conversationLang,
          uiLang: prefsRef.current.uiLang,
          level: prefsRef.current.level,
        };
      lastRequestRef.current = { text, payload };

      // One transparent retry: a dropped connection mid-turn is common on mobile.
      const run = async () => {
        try {
          return await streamSuggestions(payload, onUpdate, controller.signal);
        } catch (err) {
          if (controller.signal.aborted) throw err;
          return await streamSuggestions(payload, onUpdate, controller.signal);
        }
      };

      void run()
        .then((candidates) => {
          if (req !== reqRef.current) return;
          setStreaming(false);
          setAiStatus(candidates.length > 0 ? "done" : "idle");
          setRounds((prev) =>
            candidates.length > 0
              ? prev.map((r) => (r.id === roundId ? { ...r, candidates } : r))
              : prev.filter((r) => r.id !== roundId),
          );
        })
        .catch((err: unknown) => {
          if (req !== reqRef.current || controller.signal.aborted) return;
          setStreaming(false);
          setRounds((prev) => prev.filter((r) => r.id !== roundId));
          const message = err instanceof Error ? err.message : String(err);
          setAiStatus("error");
          setAiError(message);
        });
    },
    [],
  );

  const retrySuggestions = React.useCallback(() => {
    const last = lastRequestRef.current;
    if (last) runSuggestions(last.text, last.payload);
  }, [runSuggestions]);

  const handleFinal = React.useCallback(
    (text: string, speaker: "user" | "other") => {
      const turn = makeTurn(speaker, text);
      turnsRef.current = [...turnsRef.current, turn];
      setTurns(turnsRef.current);

      // The user answered on their own — drop whatever was still generating.
      if (speaker === "user") {
        cancelSuggestions();
        return;
      }

      // Show the line in the user's chosen translation language.
      const { conversationLang, translateLang } = prefsRef.current;
      if (translateLang !== conversationLang) {
        void translateLine({ data: { text, from: conversationLang, to: translateLang } })
          .then(({ translation }) => {
            if (!translation) return;
            turnsRef.current = turnsRef.current.map((x) =>
              x.id === turn.id ? { ...x, translation } : x,
            );
            setTurns(turnsRef.current);
          })
          .catch(() => undefined);
      }

      runSuggestions(text);
    },
    [cancelSuggestions, runSuggestions],
  );




  const handleError = React.useCallback(
    (message: string) => {
      if (message === "microphone") setError(words.micDenied);
      else if (message === "screen" || message === "system-audio") setError(words.screenDenied);
      else setError(`${words.failed}${message}`);
    },
    [words],
  );


  const transcriber = useTranscriber({
    language: prefs.conversationLang,
    audioSource: prefs.audioSource,
    micDeviceId: prefs.micDeviceId,
    onInterim: handleInterim,
    onFinal: handleFinal,
    onError: handleError,
  });

  React.useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, life, interim]);

  const startSession = async () => {
    reqRef.current += 1;
    abortRef.current?.abort();
    turnsRef.current = [];
    setTurns([]);
    setRounds([]);
    setInterim({ user: "", other: "" });
    setError("");
    setStartedAt(Date.now());
    setLife("preparing");
    const ok = await transcriber.start();
    setLife(ok ? "running" : "idle");
  };

  const togglePause = () => {
    const next = life === "paused" ? "running" : "paused";
    transcriber.setPaused(next === "paused");
    setLife(next);
  };

  const finishSession = () => {
    transcriber.stop();
    reqRef.current += 1;
    abortRef.current?.abort();
    const saved = turnsRef.current;
    const startedTs = startedAt || Date.now();
    if (saved.length > 0) {
      const payload = {
        turns: saved.map((x) => ({ speaker: x.speaker, text: x.text })),
        conversationLang: prefs.conversationLang,
        uiLang: prefs.uiLang,
        level: prefs.level,
      };
      void summarizeSession({ data: payload })
        .then((res) => {
          addSession({
            id: uid(),
            startedAt: startedTs,
            endedAt: Date.now(),
            conversationLang: prefs.conversationLang,
            level: prefs.level,
            turns: saved,
            summary: res.summary,
          });
        })
        .catch(() => {
          addSession({
            id: uid(),
            startedAt: startedTs,
            endedAt: Date.now(),
            conversationLang: prefs.conversationLang,
            level: prefs.level,
            turns: saved,
            summary: "",
          });
        });
    }
    setLife("stopped");
    setStreaming(false);
    setAiStatus("idle");
    setAiError("");
    setInterim({ user: "", other: "" });
    setConfirmStop(false);
  };



  const active = life === "running" || life === "paused" || life === "preparing";
  const statusLabel =
    life === "running"
      ? t("listening")
      : life === "paused"
        ? t("paused")
        : life === "preparing"
          ? t("preparing")
          : life === "stopped"
            ? t("stopped")
            : t("currentSession");

  return (
    <div
      className="mx-auto flex min-h-dvh max-w-6xl flex-col gap-3 p-3 sm:gap-4 sm:p-6 lg:h-dvh"
      style={{
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
      }}
    >
      <header className="glass-bar grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <span className="gradient-primary glow-sm flex size-9 shrink-0 items-center justify-center rounded-full text-primary-foreground">
            <Mic className="size-4" />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base leading-tight font-bold tracking-tight">
              {t("appName")}
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              {langLabel(prefs.conversationLang, prefs.uiLang)} ·{" "}
              {levelLabel(prefs.level, prefs.uiLang)} · {t(sourceKey(prefs.audioSource))}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <UiLanguageMenu />
          <AccountMenu />

          <Button variant="soft" size="icon" aria-label={t("history")} onClick={() => setHistoryOpen(true)}>
            <History className="size-4" />
          </Button>
          <Button
            variant="soft"
            size="icon"
            aria-label={t("settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings className="size-4" />
          </Button>
        </div>
      </header>


      {user && !voiceprintReady && !enrollDismissed ? (
        <div className="glass-quiet flex flex-wrap items-start gap-3 rounded-2xl p-4">
          <Fingerprint className="mt-0.5 size-5 text-primary" />
          <div className="min-w-48 flex-1">
            <p className="text-sm font-bold">{words.enrollTitle}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{words.enrollBody}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="soft" size="sm" onClick={() => setSettingsOpen(true)}>
              {words.enrollCta}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={words.dismiss}
              onClick={() => setEnrollDismissed(true)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      ) : null}

      <div className="grid min-h-0 flex-1 gap-3 sm:gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section className="glass-transcript flex min-h-[20rem] flex-col p-3 sm:p-5 lg:min-h-0">

          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">{t("conversation")}</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold backdrop-blur-md",
                life === "running"
                  ? "gradient-primary text-primary-foreground"
                  : "glass-quiet text-muted-foreground",
              )}
            >
              {life === "running" ? (
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              ) : null}
              {statusLabel}
            </span>
          </div>

          <ScrollArea ref={scrollRef} className="mt-3 min-h-0 flex-1">
            {turns.length === 0 && !interim.user && !interim.other ? (
              <p className="py-16 text-center text-sm text-muted-foreground">{t("noTranscript")}</p>
            ) : (
              <ul className="space-y-3 pr-3">
                {turns.map((turn) => (
                  <li
                    key={turn.id}
                    className={cn("flex", turn.speaker === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] px-4 py-2.5",
                        turn.speaker === "user"
                          ? "bubble-self"
                          : "bubble-other text-card-foreground",
                      )}
                    >
                      <p className="text-[11px] font-semibold opacity-70">
                        {turn.speaker === "user" ? t("me") : t("other")}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed">{turn.text}</p>
                      {turn.translation ? (
                        <p className="mt-1 border-t border-current/15 pt-1 text-xs leading-relaxed opacity-75">
                          {turn.translation}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
                {(["other", "user"] as const).map((who) =>
                  interim[who] ? (
                    <li
                      key={who}
                      className={cn("flex", who === "user" ? "justify-end" : "justify-start")}
                    >
                      <div className="bubble-interim max-w-[85%] px-4 py-2.5">
                        <p className="text-[11px] font-semibold text-muted-foreground">
                          {who === "user" ? t("me") : t("other")} · {words.live}
                        </p>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {interim[who]}
                        </p>
                      </div>
                    </li>
                  ) : null,
                )}
              </ul>
            )}
          </ScrollArea>

          {error ? (
            <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {transcriber.recording ? (
            <div className="glass-fill mt-3 h-1.5 overflow-hidden rounded-full">
              <div
                className="gradient-primary h-full rounded-full transition-[width] duration-100"
                style={{ width: `${Math.round(transcriber.level * 100)}%` }}
              />
            </div>
          ) : null}

        </section>

        <section className="paper-sheet flex min-h-[18rem] flex-col p-3 sm:p-5 lg:min-h-0">
          <h2 className="text-sm font-bold">{t("suggestions")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("aiSuggestions")}</p>
          <SuggestionStage
            className="mt-3 min-h-0 flex-1"
            rounds={rounds}
            streaming={streaming}
            status={aiStatus}
            errorMessage={aiError}
            attempt={aiAttempt}
            onRetry={retrySuggestions}
            canRetry={lastRequestRef.current !== null}
            statusLabels={{
              connecting: t("aiConnecting"),
              retrying: t("aiRetrying"),
              streaming: t("aiStreaming"),
              done: t("aiDone"),
              failed: t("aiFailed"),
              retry: t("aiRetry"),
            }}
            emptyHint={t("emptySuggestions")}
            previousRoundLabel={t("previousRound")}
          />
        </section>
      </div>

      {/* Kept in the viewport on phones, where the panels scroll past the fold. */}
      <div
        className="glass-bar sticky bottom-0 z-20 flex gap-2 px-3 py-2.5 sm:px-4"
        style={{ marginBottom: "calc(env(safe-area-inset-bottom) * -1)", paddingBottom: "max(0.625rem, env(safe-area-inset-bottom))" }}
      >
        {!active ? (
          <Button className="flex-1" onClick={() => void startSession()}>
            <Play className="size-4" />
            {t("start")}
          </Button>
        ) : (
          <>
            <Button
              variant="soft"
              className="flex-1"
              disabled={life === "preparing"}
              onClick={togglePause}
            >
              {life === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
              {life === "paused" ? t("resume") : t("pause")}
            </Button>
            <Button variant="destructive" className="flex-1" onClick={() => setConfirmStop(true)}>
              <Square className="size-4" />
              {t("stop")}
            </Button>
          </>
        )}
      </div>

      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("stopTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("stopDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={finishSession}>{t("stopAndSave")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} locked={active} />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}

function sourceKey(source: "microphone" | "system" | "both") {
  return source === "microphone" ? "microphone" : source === "system" ? "systemAudio" : "bothAudio";
}
