import * as React from "react";
import { History, Mic, Pause, Play, Settings, Square } from "lucide-react";
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
import type { Lifecycle, Round, Turn } from "@/lib/kibo/types";
import { useTranscriber } from "@/lib/kibo/use-transcriber";
import { summarizeSession } from "@/lib/kibo/ai.functions";
import { streamSuggestions } from "@/lib/kibo/suggest-stream";

import { SuggestionStage } from "./suggestion-stage";
import { SettingsSheet } from "./settings-sheet";
import { HistorySheet } from "./history-sheet";
import { UiLanguageMenu } from "./ui-language-menu";
import { AccountMenu } from "./account-menu";

const uid = () => Math.random().toString(36).slice(2, 10);


const copy = {
  zh: {
    micDenied: "无法访问麦克风，请在浏览器中允许麦克风权限后重试。",
    failed: "语音转写失败：",
    live: "正在听写…",
  },
  ja: {
    micDenied: "マイクにアクセスできません。ブラウザでマイクを許可してからもう一度お試しください。",
    failed: "文字起こしに失敗しました：",
    live: "書き起こし中…",
  },
  en: {
    micDenied: "Microphone access failed. Allow microphone permission and try again.",
    failed: "Transcription failed: ",
    live: "Transcribing…",
  },
} as const;


export function SessionWorkbench() {
  const { prefs, t, addSession } = useKibo();
  const [life, setLife] = React.useState<Lifecycle>("idle");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [rounds, setRounds] = React.useState<Round[]>([]);
  const [streaming, setStreaming] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [confirmStop, setConfirmStop] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(0);
  const [interim, setInterim] = React.useState("");
  const [error, setError] = React.useState("");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  const words = copy[prefs.uiLang] ?? copy.en;

  const turnsRef = React.useRef<Turn[]>([]);
  turnsRef.current = turns;
  const prefsRef = React.useRef(prefs);
  prefsRef.current = prefs;
  const reqRef = React.useRef(0);

  const handleFinal = React.useCallback(
    (text: string) => {
      const turn = makeTurn("other", text);
      turnsRef.current = [...turnsRef.current, turn];
      setTurns(turnsRef.current);

      const req = ++reqRef.current;
      const roundId = uid();
      setStreaming(true);
      // Insert an empty round immediately, then fill it in as tokens arrive.
      setRounds((prev) => [{ id: roundId, prompt: text, candidates: [] }, ...prev]);

      void streamSuggestions(
        {
          turns: turnsRef.current.map((x) => ({ speaker: x.speaker, text: x.text })),
          conversationLang: prefsRef.current.conversationLang,
          uiLang: prefsRef.current.uiLang,
          level: prefsRef.current.level,
        },
        (candidates) => {
          if (req !== reqRef.current) return;
          setRounds((prev) =>
            prev.map((r) => (r.id === roundId ? { ...r, candidates } : r)),
          );
        },
      )
        .then((candidates) => {
          if (req !== reqRef.current) return;
          setStreaming(false);
          setRounds((prev) =>
            candidates.length > 0
              ? prev.map((r) => (r.id === roundId ? { ...r, candidates } : r))
              : prev.filter((r) => r.id !== roundId),
          );
        })
        .catch((err: unknown) => {
          if (req !== reqRef.current) return;
          setStreaming(false);
          setRounds((prev) => prev.filter((r) => r.id !== roundId));
          setError(`${words.failed}${err instanceof Error ? err.message : String(err)}`);
        });
    },
    [words],
  );


  const handleError = React.useCallback(
    (message: string) => {
      setError(message === "microphone" ? words.micDenied : `${words.failed}${message}`);
    },
    [words],
  );

  const transcriber = useTranscriber({
    language: prefs.conversationLang,
    onInterim: setInterim,
    onFinal: handleFinal,
    onError: handleError,
  });

  React.useEffect(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (el) el.scrollTop = el.scrollHeight;
  }, [turns.length, life, interim]);

  const startSession = async () => {
    reqRef.current += 1;
    turnsRef.current = [];
    setTurns([]);
    setRounds([]);
    setInterim("");
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
    setInterim("");
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
    <div className="mx-auto flex h-dvh max-w-6xl flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Mic className="size-4" />
          </span>
          <div>
            <h1 className="text-base leading-tight font-bold tracking-tight">{t("appName")}</h1>
            <p className="text-xs text-muted-foreground">
              {langLabel(prefs.conversationLang, prefs.uiLang)} ·{" "}
              {levelLabel(prefs.level, prefs.uiLang)} · {t(nodeKey(prefs.defaultNode))}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
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

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.15fr_1fr]">
        <section className="glass-transcript flex min-h-0 flex-col p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">{t("conversation")}</h2>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                life === "running"
                  ? "bg-primary/15 text-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {life === "running" ? (
                <span className="size-1.5 animate-pulse rounded-full bg-primary" />
              ) : null}
              {statusLabel}
            </span>
          </div>

          <ScrollArea ref={scrollRef} className="mt-3 min-h-0 flex-1">
            {turns.length === 0 && !interim ? (
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
                        "max-w-[85%] rounded-2xl px-4 py-2.5",
                        turn.speaker === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card text-card-foreground shadow-sm",
                      )}
                    >
                      <p className="text-[11px] font-semibold opacity-70">
                        {turn.speaker === "user" ? t("me") : t("other")}
                      </p>
                      <p className="mt-0.5 text-sm leading-relaxed">{turn.text}</p>
                    </div>
                  </li>
                ))}
                {interim ? (
                  <li className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl border border-dashed border-primary/50 bg-card/70 px-4 py-2.5">
                      <p className="text-[11px] font-semibold text-muted-foreground">{words.live}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                        {interim}
                      </p>
                    </div>
                  </li>
                ) : null}
              </ul>
            )}
          </ScrollArea>

          {error ? (
            <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}

          {transcriber.recording ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.round(transcriber.level * 100)}%` }}
              />
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
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

        </section>

        <section className="paper-sheet flex min-h-0 flex-col p-4 sm:p-5">
          <h2 className="text-sm font-bold">{t("suggestions")}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("aiSuggestions")}</p>
          <SuggestionStage
            className="mt-3 min-h-0 flex-1"
            rounds={rounds}
            streaming={streaming}
            emptyHint={t("emptySuggestions")}
            generatingLabel={t("generatingSuggestions")}
            previousRoundLabel={t("previousRound")}
          />
        </section>
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

function nodeKey(node: "local" | "japan" | "relay") {
  return node === "local" ? "localNode" : node === "japan" ? "japanNode" : "relayNode";
}
