import * as React from "react";
import {
  classifyAiError,
  describeAiError,
  type AiErrorKind,
} from "@/lib/kibo/ai-error";

import { Brain, HelpCircle, History, Lightbulb, Mic, Pause, Play, Settings, Square, User, Users } from "lucide-react";
import { Link } from "@tanstack/react-router";
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

import { MemoSuggestionStage as SuggestionStage } from "./suggestion-stage";
import { SettingsSheet } from "./settings-sheet";
import { HistorySheet } from "./history-sheet";
import { GuideSheet } from "./guide-sheet";
import { UiLanguageMenu } from "./ui-language-menu";
import { AccountMenu } from "./account-menu";
import { HoldTalkButton } from "./hold-talk-button";
import { VadDiagnostics } from "./vad-diagnostics";
import { loadMemoryContext } from "@/lib/kibo/memory";
import { useSession } from "@/lib/kibo/use-session";


const uid = () => Math.random().toString(36).slice(2, 10);

/** Shown when the model returns nothing usable, so the panel is never blank. */
const emptyAiMessage: Record<string, string> = {
  zh: "这次没有生成建议，点重试再来一次。",
  ja: "候補が生成されませんでした。再試行してください。",
  en: "No suggestions came back — tap retry.",
};



const copy = {
  zh: {
    micDenied: "无法访问麦克风，请在浏览器中允许麦克风权限后重试。",
    screenDenied: "未能获取系统音频，请在共享对话框中勾选“分享标签页/系统音频”。",
    screenSkipped: "已跳过系统音频（未选择共享），本次只采集麦克风。想采集线上通话声音时，请在设置里选择“系统音频”并在弹窗中勾选“同时分享音频”。",
    failed: "语音转写失败：",
    live: "正在听写…",
  },
  ja: {
    micDenied: "マイクにアクセスできません。ブラウザでマイクを許可してからもう一度お試しください。",
    screenDenied: "システム音声を取得できませんでした。共有ダイアログで「音声を共有」を有効にしてください。",
    screenSkipped: "システム音声はスキップされました。今回はマイクのみで進みます。",
    failed: "文字起こしに失敗しました：",
    live: "書き起こし中…",
  },
  en: {
    micDenied: "Microphone access failed. Allow microphone permission and try again.",
    screenDenied: "System audio was not shared. Enable “share audio” in the sharing dialog.",
    screenSkipped: "System audio skipped — continuing with the microphone only.",
    failed: "Transcription failed: ",
    live: "Transcribing…",
  },
} as const;


export function SessionWorkbench() {
  const { prefs, t, addSession } = useKibo();
  /** Continuous mode: who the microphone is currently attributed to. */
  const [speaker, setSpeaker] = React.useState<"user" | "other">("other");
  const [life, setLife] = React.useState<Lifecycle>("idle");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [aiStatus, setAiStatus] = React.useState<
    "idle" | "connecting" | "retrying" | "streaming" | "done" | "error"
  >("idle");
  const [aiError, setAiError] = React.useState("");
  const [aiErrorKind, setAiErrorKind] = React.useState<AiErrorKind>("unknown");

  const [aiAttempt, setAiAttempt] = React.useState(0);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [confirmStop, setConfirmStop] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(0);
  const [interim, setInterim] = React.useState<{ user: string; other: string }>({
    user: "",
    other: "",
  });
  const [error, setError] = React.useState("");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const words = copy[prefs.uiLang] ?? copy.en;
  const guideLabel =
    prefs.uiLang === "zh" ? "使用指南" : prefs.uiLang === "ja" ? "使い方ガイド" : "How to use";

  const turnsRef = React.useRef<Turn[]>([]);
  turnsRef.current = turns;
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;

  // Kibo Memory: stable facts about the user, loaded once and reused for every
  // suggestion so the coach keeps them in mind across sessions.
  const { user: authUser } = useSession();
  const memoryRef = React.useRef<string[]>([]);
  React.useEffect(() => {
    if (!authUser?.id) {
      memoryRef.current = [];
      return;
    }
    let cancelled = false;
    void loadMemoryContext(authUser.id).then((rows) => {
      if (!cancelled) memoryRef.current = rows;
    });
    return () => {
      cancelled = true;
    };
  }, [authUser?.id]);
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
    latest: string;
    conversationLang: string;
    uiLang: string;
    level: string;
    profile?: string;
    memory?: string[];
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
      // Only the round for the newest line stays on screen: suggestions written
      // for an older message are stale the moment the context moves on.
      setRounds([{ id: roundId, prompt: text, candidates: [] }]);

      // Whatever the stream managed to produce, so a late failure never wipes
      // suggestions the user is already reading.
      let partial: Candidate[] = [];
      const onUpdate = (candidates: Candidate[]) => {
        if (req !== reqRef.current) return;
        partial = candidates;
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
          latest: text,
          conversationLang: prefsRef.current.conversationLang,
          uiLang: prefsRef.current.uiLang,
          level: prefsRef.current.level,
          profile: [
            prefsRef.current.profileName && `name: ${prefsRef.current.profileName}`,
            prefsRef.current.profileAbout,
            prefsRef.current.profileGoal && `goal: ${prefsRef.current.profileGoal}`,
          ]
            .filter(Boolean)
            .join("; "),
          memory: memoryRef.current,
        };
      lastRequestRef.current = { text, payload };


      // One transparent retry, but only while nothing has been shown yet:
      // re-running after tokens landed would restart the answer from scratch.
      const run = async () => {
        try {
          return await streamSuggestions(payload, onUpdate, controller.signal);
        } catch (err) {
          if (controller.signal.aborted || partial.length > 0) throw err;
          return await streamSuggestions(payload, onUpdate, controller.signal);
        }
      };

      void run()
        .then((candidates) => {
          if (req !== reqRef.current) return;
          setStreaming(false);
          const final = candidates.length > 0 ? candidates : partial;
          if (final.length > 0) {
            setAiStatus("done");
            setAiError("");
            setRounds((prev) =>
              prev.map((r) => (r.id === roundId ? { ...r, candidates: final } : r)),
            );
          } else {
            // An empty answer must not vanish silently — offer a retry.
            setAiStatus("error");
            setAiErrorKind("empty");
            setAiError(emptyAiMessage[prefsRef.current.uiLang] ?? "No suggestions came back.");

            setRounds((prev) => prev.filter((r) => r.id !== roundId));
          }
        })
        .catch((err: unknown) => {
          if (req !== reqRef.current || controller.signal.aborted) return;
          setStreaming(false);
          // A connection that dropped after some text still gave usable ideas:
          // keep them on screen and finish quietly instead of showing a failure.
          if (partial.length > 0) {
            setAiStatus("done");
            setAiError("");
            setRounds((prev) =>
              prev.map((r) => (r.id === roundId ? { ...r, candidates: partial } : r)),
            );
            return;
          }
          setRounds((prev) => prev.filter((r) => r.id !== roundId));
          const message = err instanceof Error ? err.message : String(err);
          setAiStatus("error");
          setAiErrorKind(classifyAiError(err));
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

      // Every finished line from the other person triggers ideas automatically,
      // in both capture modes. The manual button stays as a way to re-ask.
      runSuggestions(text);

    },
    [cancelSuggestions, runSuggestions],
  );

  /** Continuous mode: generate ideas for the other person's latest line. */
  const askForIdeas = React.useCallback(() => {
    const last = [...turnsRef.current].reverse().find((x) => x.speaker === "other");
    if (last) runSuggestions(last.text);
  }, [runSuggestions]);

  // Changing the target language or level invalidates suggestions written for
  // the old settings — clear them instead of showing stale advice.
  const contextKey = `${prefs.conversationLang}|${prefs.level}`;
  const contextKeyRef = React.useRef(contextKey);
  React.useEffect(() => {
    if (contextKeyRef.current === contextKey) return;
    contextKeyRef.current = contextKey;
    cancelSuggestions();
    setRounds([]);
    lastRequestRef.current = null;
  }, [contextKey, cancelSuggestions]);


  const handleError = React.useCallback(
    (message: string) => {
      const soft = message.endsWith(":soft");
      const kind = soft ? message.slice(0, -5) : message;
      if (kind === "microphone") setError(words.micDenied);
      else if (kind === "screen" || kind === "system-audio")
        setError(soft ? words.screenSkipped : words.screenDenied);
      else setError(`${words.failed}${message}`);
    },
    [words],
  );



  const transcriber = useTranscriber({
    language: prefs.conversationLang,
    audioSource: prefs.audioSource,
    micDeviceId: prefs.micDeviceId,
    mode: prefs.captureMode,
    activeSpeaker: speaker,
    onInterim: handleInterim,
    onFinal: handleFinal,
    onError: handleError,
  });

  React.useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!(el instanceof HTMLElement)) return;
    // Follow the conversation only while the user is already at the bottom, so
    // scrolling up to re-read an earlier line is never yanked back down.
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (atBottom) el.scrollTop = el.scrollHeight;
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
    // The finished conversation lives in history now — start from a clean board.
    turnsRef.current = [];
    setTurns([]);
    setRounds([]);
    lastRequestRef.current = null;
    setConfirmStop(false);
  };



  const active = life === "running" || life === "paused" || life === "preparing";

  // The floating phone dock is position:fixed, so the scroll container needs a
  // spacer that always matches its real height (it grows with the hold row).
  const dockRef = React.useRef<HTMLDivElement | null>(null);
  const [dockHeight, setDockHeight] = React.useState(140);
  React.useEffect(() => {
    const el = dockRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((entries) => {
      const h = entries[0]?.contentRect.height;
      if (h) setDockHeight(h);
    });

    ro.observe(el);
    setDockHeight(el.getBoundingClientRect().height);
    return () => ro.disconnect();
  }, []);

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

          <Button variant="soft" size="icon" asChild aria-label="Kibo 记忆" title="Kibo 记忆">
            <Link to="/memory">
              <Brain className="size-4" />
            </Link>
          </Button>
          <Button
            variant="soft"
            size="icon"
            aria-label={guideLabel}
            title={guideLabel}
            onClick={() => setGuideOpen(true)}
          >
            <HelpCircle className="size-4" />
          </Button>
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



      {/* One orb instead of two framed panels: transcript and suggestions share
          a single spherical glass surface. */}
      <div
        style={
          prefs.panelLayout === "row"
            ? ({
                "--pc-font": String(prefs.rowFontScale ?? 1),
                "--pc-line": String(prefs.rowLineScale ?? 1),
                "--pc-gap": String(prefs.rowGapScale ?? 1),
              } as React.CSSProperties)
            : undefined
        }
        className="relative flex min-h-0 flex-1 flex-col"
      >
        <div aria-hidden className="orb-aurora" />
        <div
          className={cn(
            "orb-stage relative flex min-h-0 flex-1 gap-3 overflow-hidden p-4 sm:gap-5 sm:p-6",
            prefs.panelLayout === "row" ? "panel-compact flex-row" : "flex-col",
          )}
        >
        <section
          className={cn(
            "flex min-w-0 min-h-0 flex-col",
            prefs.panelLayout === "row" ? "flex-1" : "flex-[1.1]",
          )}
        >



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

          <VadDiagnostics
            className="mt-3 hidden sm:block"
            diagnostics={transcriber.diagnostics}
            mode={prefs.captureMode}
            uiLang={prefs.uiLang}
            recording={transcriber.recording}
          />


        </section>

        <section
          className={cn(
            "paper-sheet flex min-w-0 flex-col overflow-hidden p-3 sm:p-5",
            prefs.panelLayout === "row" &&
              "panel-compact h-[46dvh] p-2.5 sm:h-auto sm:min-h-[18rem] sm:p-5 lg:min-h-0",
            prefs.panelLayout === "column" && "h-[38dvh] sm:h-[40dvh] sm:min-h-[12rem]",
            (!prefs.panelLayout || prefs.panelLayout === "auto") &&
              "h-[38dvh] sm:h-auto sm:min-h-[18rem] lg:min-h-0",
          )}
        >


          <h2 className="text-sm font-bold">{t("suggestions")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("aiSuggestions")}</p>
          <SuggestionStage
            className="mt-3 min-h-0 flex-1"
            rounds={rounds}
            streaming={streaming}
            status={aiStatus}
            errorMessage={aiError}
            errorTitle={describeAiError(aiErrorKind, prefs.uiLang).title}
            errorAdvice={describeAiError(aiErrorKind, prefs.uiLang).advice}

            attempt={aiAttempt}
            onRetry={retrySuggestions}
            canRetry={lastRequestRef.current !== null}
            statusLabels={{
              connecting: t("aiConnecting"),
              retrying: t("aiRetrying"),
              attempt: t("aiAttempt"),
              streaming: t("aiStreaming"),
              done: t("aiDone"),
              failed: t("aiFailed"),
              retry: t("aiRetry"),
            }}
            emptyHint={t("emptySuggestions")}
            previousRoundLabel={t("previousRound")}
            detailLabels={{
              show: t("showDetail"),
              hide: t("hideDetail"),
              alt: t("altPhrasing"),
              points: t("keyPoints"),
            }}

          />
        </section>
      </div>

      {/* Spacer so the floating phone dock never covers the last panel. */}
      <div aria-hidden className="shrink-0 sm:hidden" style={{ height: dockHeight + 16 }} />

      {/* Phone: floating thumb-reach dock. Tablet/desktop: inline sticky bar. */}
      <div
        ref={dockRef}
        className={cn(
          "glass-bar z-30 flex flex-col gap-2.5 px-3 py-3",
          "fixed inset-x-2 bottom-2 shadow-lg",
          "sm:sticky sm:inset-x-auto sm:bottom-0 sm:gap-2 sm:px-4 sm:py-2.5 sm:shadow-none",

        )}
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >


        {active && life !== "preparing" ? (
          prefs.captureMode === "push" ? (
            <>
              <div className="flex gap-3 sm:gap-2">

                {(["other", "user"] as const).map((who) => (
                  <HoldTalkButton
                    key={who}
                    active={transcriber.holding === who}
                    blocked={transcriber.holding !== null && transcriber.holding !== who}
                    disabled={life === "paused"}
                    label={who === "other" ? t("holdOther") : t("holdMe")}
                    activeLabel={who === "other" ? t("holdingOther") : t("holdingMe")}
                    icon={who === "other" ? <Users className="size-4" /> : <User className="size-4" />}
                    level={transcriber.level}
                    onBegin={() => transcriber.beginTurn(who)}
                    onEnd={() => transcriber.endTurn()}
                  />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">
                  {transcriber.holding ? t("releaseToSend") : t("holdHint")}
                </p>
                <Button
                  variant="soft"
                  size="sm"
                  className="shrink-0"
                  onClick={askForIdeas}
                  disabled={streaming || !turns.some((x) => x.speaker === "other")}
                >
                  <Lightbulb className="size-4" />
                  {t("askIdeas")}
                </Button>
              </div>
            </>


          ) : (
            <div className="flex gap-2">
              <div className="flex flex-1 gap-1 rounded-full bg-muted/60 p-1">
                {(["other", "user"] as const).map((who) => (
                  <button
                    key={who}
                    type="button"
                    onClick={() => {
                      navigator.vibrate?.(6);
                      setSpeaker(who);
                    }}
                    className={cn(
                      "flex-1 rounded-full px-3 py-2 text-xs font-semibold transition",
                      speaker === who
                        ? "gradient-primary text-primary-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    {who === "other" ? t("other") : t("me")}
                  </button>
                ))}
              </div>
              <Button className="flex-1" onClick={askForIdeas} disabled={streaming}>
                <Lightbulb className="size-4" />
                {t("askIdeas")}
              </Button>
            </div>
          )
        ) : null}

        <div
          className={cn(
            "flex gap-2 border-t border-border/60 pt-2.5 transition-opacity sm:border-0 sm:pt-0",
            // While a turn is held, the secondary row is inert so a stray thumb
            // can't pause or stop the session mid-sentence.
            transcriber.holding && "pointer-events-none opacity-40",
          )}
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
      <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}

function sourceKey(source: "microphone" | "system" | "both") {
  return source === "microphone" ? "microphone" : source === "system" ? "systemAudio" : "bothAudio";
}
