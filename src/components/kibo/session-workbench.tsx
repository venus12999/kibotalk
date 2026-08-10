import * as React from "react";
import { classifyAiError, describeAiError, type AiErrorKind } from "@/lib/kibo/ai-error";

import {
  ChevronDown,
  ChevronUp,
  HelpCircle,
  History,
  Lightbulb,
  Mic,
  Pause,
  Play,
  Settings,
  Square,
  User,
  Users,
} from "lucide-react";
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
import { OnboardingTour } from "./onboarding-tour";
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
    screenSkipped:
      "已跳过系统音频（未选择共享），本次只采集麦克风。想采集线上通话声音时，请在设置里选择“系统音频”并在弹窗中勾选“同时分享音频”。",
    failed: "语音转写失败：",
    live: "正在听写…",
  },
  ja: {
    micDenied: "マイクにアクセスできません。ブラウザでマイクを許可してからもう一度お試しください。",
    screenDenied:
      "システム音声を取得できませんでした。共有ダイアログで「音声を共有」を有効にしてください。",
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
  const { prefs, setPrefs, t, addSession } = useKibo();
  // Phone dock: floating card or edge bar, with a user-set size and a collapse
  // toggle so the thumb zone never has to cover the panels above it.
  const dockStyle = prefs.dockStyle ?? "float";
  const dockScale = prefs.dockScale ?? 1;
  const dockCollapsed = Boolean(prefs.dockCollapsed);
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
  /** Live-voice stage: which pull-up panel is open under the orb. */
  const [livePanel, setLivePanel] = React.useState<"none" | "transcript" | "ideas">("ideas");
  // New ideas arriving should surface themselves, like a voice-mode caption card.
  React.useEffect(() => {
    if (streaming) setLivePanel((p) => (p === "transcript" ? p : "ideas"));
  }, [streaming]);
  React.useEffect(() => {
    if (rounds.length > 0) setLivePanel((p) => (p === "transcript" ? p : "ideas"));
  }, [rounds.length]);

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
  // Wide screens get the orb flanked by conversation (left) and ideas (right).
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  const words = copy[prefs.uiLang] ?? copy.en;
  const guideLabel =
    prefs.uiLang === "zh" ? "使用指南" : prefs.uiLang === "ja" ? "使い方ガイド" : "How to use";

  const turnsRef = React.useRef<Turn[]>([]);
  turnsRef.current = turns;
  const [exitingId, setExitingId] = React.useState<string | null>(null);
  const exitingTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
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
  const runSuggestions = React.useCallback((text: string, replay?: SuggestPayload) => {
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
    const payload: SuggestPayload = replay ?? {
      turns: turnsRef.current.map((x) => ({ speaker: x.speaker, text: x.text })),
      latest: text,
      conversationLang: prefsRef.current.conversationLang,
      uiLang: prefsRef.current.uiLang,
      level: prefsRef.current.level,
      profile: [
        prefsRef.current.profileName && `name: ${prefsRef.current.profileName}`,
        prefsRef.current.profileAbout,
        prefsRef.current.profileGoal && `goal: ${prefsRef.current.profileGoal}`,
        prefsRef.current.profileRole && `role: ${prefsRef.current.profileRole}`,
        prefsRef.current.profileAge && `age: ${prefsRef.current.profileAge}`,
        prefsRef.current.profileNativeLang && `native: ${prefsRef.current.profileNativeLang}`,
        prefsRef.current.profileCity && `city: ${prefsRef.current.profileCity}`,
        prefsRef.current.profileGoals.length > 0 &&
          `goals: ${prefsRef.current.profileGoals.join(", ")}`,
        prefsRef.current.profileScenes.length > 0 &&
          `scenes: ${prefsRef.current.profileScenes.join(", ")}`,
        prefsRef.current.profileTones.length > 0 &&
          `tone: ${prefsRef.current.profileTones.join(", ")}`,
        prefsRef.current.profileStuck.length > 0 &&
          `when stuck: ${prefsRef.current.profileStuck.join(", ")}`,
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
  }, []);

  const retrySuggestions = React.useCallback(() => {
    const last = lastRequestRef.current;
    if (last) runSuggestions(last.text, last.payload);
  }, [runSuggestions]);

  const handleFinal = React.useCallback(
    (text: string, speaker: "user" | "other") => {
      const turn = makeTurn(speaker, text);
      const prevTurns = turnsRef.current;
      const nextTurns = [...prevTurns, turn];
      turnsRef.current = nextTurns;
      setTurns(nextTurns);
      // The line that just fell out of the visible pair animates away.
      const pushedOut = prevTurns.length >= 2 ? prevTurns[prevTurns.length - 2] : undefined;
      if (pushedOut) {
        const pushedId = pushedOut.id;
        setExitingId(pushedId);
        if (exitingTimerRef.current) clearTimeout(exitingTimerRef.current);
        exitingTimerRef.current = setTimeout(() => {
          setExitingId((current) => (current === pushedId ? null : current));
        }, 420);
      }

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

  // Autoscroll: follow the newest caption, but pause the moment the user
  // scrolls up to re-read something. Resuming happens when they return to the
  // bottom (or tap the "jump to latest" pill).
  const [following, setFollowing] = React.useState(true);
  const followingRef = React.useRef(true);
  followingRef.current = following;

  const getViewport = React.useCallback(() => {
    const el = scrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    return el instanceof HTMLElement ? el : null;
  }, []);

  const scrollToLatest = React.useCallback(() => {
    const el = getViewport();
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    setFollowing(true);
  }, [getViewport]);

  React.useEffect(() => {
    const el = getViewport();
    if (!el) return;
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
      if (atBottom !== followingRef.current) setFollowing(atBottom);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener("scroll", onScroll);
  }, [getViewport, livePanel]);

  React.useEffect(() => {
    const el = getViewport();
    if (!el || !followingRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, life, interim, livePanel, getViewport]);

  // Optional scroll linking: on wide screens the conversation (left) and the
  // ideas (right) can follow each other proportionally, or stay independent.
  const ideasScrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!wide || (prefs.scrollSync ?? "independent") !== "linked") return;
    const left = getViewport();
    const right = ideasScrollRef.current?.querySelector("[data-radix-scroll-area-viewport]");
    if (!left || !(right instanceof HTMLElement)) return;

    let lock = false;
    const mirror = (from: HTMLElement, to: HTMLElement) => () => {
      if (lock) return;
      const room = from.scrollHeight - from.clientHeight;
      const target = to.scrollHeight - to.clientHeight;
      if (room <= 0 || target <= 0) return;
      lock = true;
      to.scrollTop = (from.scrollTop / room) * target;
      requestAnimationFrame(() => {
        lock = false;
      });
    };
    const onLeft = mirror(left, right);
    const onRight = mirror(right, left);
    left.addEventListener("scroll", onLeft, { passive: true });
    right.addEventListener("scroll", onRight, { passive: true });
    return () => {
      left.removeEventListener("scroll", onLeft);
      right.removeEventListener("scroll", onRight);
    };
  }, [wide, prefs.scrollSync, getViewport, livePanel]);

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
      <header
        className={`glass-bar grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3 ${
          active ? "hidden sm:grid" : "grid"
        }`}
      >
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

          <Button
            variant="soft"
            size="icon"
            aria-label={guideLabel}
            title={guideLabel}
            onClick={() => setGuideOpen(true)}
          >
            <HelpCircle className="size-4" />
          </Button>
          <Button
            variant="soft"
            size="icon"
            aria-label={t("history")}
            onClick={() => setHistoryOpen(true)}
          >
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

      {/* Live-voice stage: a breathing orb in the middle, the conversation
          floating to its left and the three ideas floating to its right. */}
      {(() => {
        const jumpLabel =
          prefs.uiLang === "zh" ? "回到最新" : prefs.uiLang === "ja" ? "最新へ" : "Jump to latest";

        // Only the two most recent turns stay on screen: every new line pushes
        // the oldest one out, and the text floats without any bubble. The line
        // that was pushed out lingers briefly to fade out and drift upward.
        const recentTurns = turns.slice(-2);
        const exitingTurn =
          exitingId && !recentTurns.some((x) => x.id === exitingId)
            ? turns.find((x) => x.id === exitingId)
            : undefined;
        const visibleTurns = exitingTurn ? [exitingTurn, ...recentTurns] : recentTurns;
        const transcriptView = (
          <div className="relative flex min-h-0 flex-1 flex-col justify-end">
            <ScrollArea ref={scrollRef} className="min-h-0 flex-1">
              {recentTurns.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  {t("noTranscript")}
                </p>
              ) : (
                <ul className="flex flex-col justify-end gap-5 pr-3">
                  {visibleTurns.map((turn) => (
                    <li
                      key={turn.id}
                      className={cn(
                        turn.id === exitingId ? "line-exit" : "idea-rise",
                        turn.speaker === "user"
                          ? "text-right text-transcript-self [text-shadow:0_1px_3px_oklch(0%_0_0/0.22)]"
                          : "text-left text-transcript-other",
                      )}
                    >
                      <div
                        className={cn(
                          "flex items-baseline gap-2 text-[11px] font-semibold opacity-70",
                          turn.speaker === "user" ? "justify-end" : "justify-start",
                        )}
                      >
                        <span>{turn.speaker === "user" ? t("me") : t("other")}</span>
                        <time
                          dateTime={new Date(turn.at).toISOString()}
                          className="tabular-nums font-normal"
                        >
                          {new Date(turn.at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                      <p className="mt-1 whitespace-pre-wrap break-words text-base font-semibold leading-relaxed">
                        {turn.text}
                      </p>
                      {turn.speaker === "other" && turn.translation ? (
                        <p className="mt-1 text-xs italic leading-relaxed opacity-70">
                          {turn.translation}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </div>
        );

        const ideasView = (
          <SuggestionStage
            scrollRef={ideasScrollRef}
            className={cn("min-h-0 flex-1", wide && "h-auto min-h-[40dvh] max-h-[72dvh]")}
            fontScale={prefs.suggestionFontScale}
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
        );

        const orb = (
          <div className="relative flex flex-col items-center gap-5">
            <div className="relative flex items-center justify-center">
              <div aria-hidden className="orb-aurora" />
              <div
                aria-hidden
                className={cn(
                  "kibo-orb relative size-44 transition-transform duration-100 ease-out sm:size-56",
                  !transcriber.recording && "orb-float",
                  streaming && "orb-pulse",
                )}
                style={{
                  transform: transcriber.recording
                    ? `scale(${1 + 0.06 + Math.min(transcriber.level, 1) * 0.28})`
                    : undefined,
                }}
              />
              <span className="pointer-events-none absolute text-sm font-semibold text-primary-foreground/90">
                {statusLabel}
              </span>
            </div>
            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
          </div>
        );

        return (
          <main className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5 py-4">
            {wide ? (
              <div className="grid w-full min-h-0 flex-1 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 sm:gap-6">
                {/* Left: the conversation floating in the blank space. */}
                <section className="flex h-[56dvh] min-h-0 flex-col overflow-hidden">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t("conversation")}
                  </p>
                  {transcriptView}
                </section>

                {orb}

                {/* Right: the three ideas grow/shrink to their content, so they
                    can be shorter than the dialog or taller when needed. */}
                <section className="flex h-auto min-h-[40dvh] max-h-[76dvh] flex-col overflow-hidden">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    <Lightbulb className="size-3.5" />
                    {t("suggestions")}
                  </p>
                  {ideasView}
                </section>
              </div>
            ) : (
              <>
                {/* Mobile: keep transcript + suggestions above the thumb zone so
                    holding the dock buttons doesn't cover them. */}
                <div className="grid w-full min-h-0 shrink-0 grid-cols-2 gap-3">
                  <section className="flex h-[32dvh] min-h-0 flex-col overflow-hidden">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {t("conversation")}
                    </p>
                    {transcriptView}
                  </section>
                  <section className="flex h-[32dvh] min-h-0 flex-col overflow-hidden">
                    <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      <Lightbulb className="size-3" />
                      {t("suggestions")}
                    </p>
                    {ideasView}
                  </section>
                </div>
                {/* Idle: orb centered. In session: it slides down a little and
                    tucks slightly under the dock to free reading space. */}
                <div className={active ? "-mb-8 mt-auto scale-90" : "m-auto"}>{orb}</div>
              </>
            )}
          </main>
        );
      })()}

      {/* Spacer so the floating phone dock never covers the last panel. */}
      <div
        aria-hidden
        className="shrink-0 sm:hidden"
        style={{ height: Math.max(dockHeight - 48, 8) }}
      />

      {/* Phone: floating thumb-reach dock. Tablet/desktop: inline sticky bar. */}
      <div
        ref={dockRef}
        className={cn(
          "glass-bar z-30 flex flex-col gap-2 px-3 py-2",
          "fixed shadow-lg",
          dockStyle === "bar"
            ? "inset-x-0 bottom-0 rounded-b-none rounded-t-2xl"
            : "inset-x-3 bottom-4",
          dockCollapsed && "dock-compact",
          "sm:sticky sm:inset-x-auto sm:bottom-0 sm:gap-2 sm:rounded-2xl sm:px-4 sm:py-2.5 sm:shadow-none",
        )}
        style={
          {
            paddingBottom:
              dockStyle === "bar"
                ? "max(0.5rem, env(safe-area-inset-bottom))"
                : "max(0.5rem, env(safe-area-inset-bottom))",
            "--dock-scale": String(dockScale),
          } as React.CSSProperties
        }
      >
        {active && life !== "preparing" ? (
          <button
            type="button"
            aria-expanded={!dockCollapsed}
            onClick={() => {
              navigator.vibrate?.(6);
              setPrefs({ dockCollapsed: !dockCollapsed });
            }}
            className="mx-auto -mt-1 flex items-center gap-1 rounded-full px-3 py-1 text-[10px] font-semibold text-muted-foreground sm:hidden"
          >
            {dockCollapsed ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {dockCollapsed ? t("dockExpand") : t("dockCollapse")}
          </button>
        ) : null}

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
                    icon={
                      who === "other" ? <Users className="size-4" /> : <User className="size-4" />
                    }
                    level={transcriber.level}
                    onBegin={() => transcriber.beginTurn(who)}
                    onEnd={() => transcriber.endTurn()}
                  />
                ))}
              </div>
              <div className="dock-secondary flex items-center gap-2">
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
      <OnboardingTour onOpenGuide={() => setGuideOpen(true)} />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}

function sourceKey(source: "microphone" | "system" | "both") {
  return source === "microphone" ? "microphone" : source === "system" ? "systemAudio" : "bothAudio";
}
