import * as React from "react";
import { classifyAiError, describeAiError, type AiErrorKind } from "@/lib/kibo/ai-error";

import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Lightbulb,
  Menu,
  Mic,
  Pause,
  Play,
  User,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { langLabel, levelLabel, useKibo } from "@/lib/kibo/store";
import { makeTurn } from "@/lib/kibo/mock";
import type { Candidate, Lifecycle, Round, Turn } from "@/lib/kibo/types";
import { useTranscriber } from "@/lib/kibo/use-transcriber";
import { summarizeSession, translateLine } from "@/lib/kibo/ai.functions";
import { streamSuggestions } from "@/lib/kibo/suggest-stream";

import { MemoSuggestionStage as SuggestionStage } from "./suggestion-stage";
import { GuideSheet } from "./guide-sheet";
import { OnboardingTour } from "./onboarding-tour";
import { HoldTalkButton } from "./hold-talk-button";
import { VadDiagnostics } from "./vad-diagnostics";
import { VoiceCloud } from "./voice-cloud";
import { AccountMenu } from "./account-menu";
import { SettingsSheet } from "./settings-sheet";
import { HistorySheet } from "./history-sheet";
import { loadMemoryContext } from "@/lib/kibo/memory";
import { useSession } from "@/lib/kibo/use-session";
import { hapticTap } from "@/lib/haptics";

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

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function SessionWorkbench({
  onExitHome,
  onOpenHistory,
  variant = "mobile",
  suspended = false,
}: {
  onExitHome?: () => void;
  /** Desktop: open the shell history panel instead of the mobile sheet. */
  onOpenHistory?: () => void;
  variant?: "mobile" | "desktop";
  /** Desktop: hide under history — pause capture so mic doesn’t keep running. */
  suspended?: boolean;
}) {
  const isDesktop = variant === "desktop";
  const resumeLifeRef = React.useRef<"running" | null>(null);
  const { prefs, setPrefs, t, addSession, history } = useKibo();
  // Phone dock: edge bar by default (less overlap than a floating card).
  const dockStyle = prefs.dockStyle ?? "bar";
  const dockScale = prefs.dockScale ?? 1;
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
  const [guideOpen, setGuideOpen] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [historyFocusId, setHistoryFocusId] = React.useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = React.useState(false);
  const [confirmStop, setConfirmStop] = React.useState(false);
  const [startedAt, setStartedAt] = React.useState(0);
  const [now, setNow] = React.useState(() => Date.now());
  const [interim, setInterim] = React.useState<{ user: string; other: string }>({
    user: "",
    other: "",
  });
  const [error, setError] = React.useState("");

  const scrollRef = React.useRef<HTMLDivElement>(null);
  // Wide screens get the orb flanked by conversation (left) and ideas (right).
  // prefs.panelLayout can force row / column; "auto" follows the breakpoint.
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 768px)");
    const onChange = () => setWide(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  const panelLayout = prefs.panelLayout ?? "auto";
  // Desktop shell owns the right rail; never nest a second side-by-side layout.
  const sideBySide =
    !isDesktop && (panelLayout === "row" || (panelLayout === "auto" && wide));

  const words = copy[prefs.uiLang] ?? copy.en;

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
    if (!authUser?.id || !prefs.useMemoryContext) {
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
  }, [authUser?.id, prefs.useMemoryContext]);
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
      if (speaker === "user" && text.trim().length > 1) {
        cancelSuggestions();
      }
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
      profile: !prefsRef.current.useProfileContext
        ? ""
        : [
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
      memory: prefsRef.current.useMemoryContext ? memoryRef.current : [],
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

      if (prefsRef.current.autoSuggest !== false) {
        runSuggestions(text);
      }
    },
    [cancelSuggestions, runSuggestions],
  );

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
  }, [getViewport]);

  React.useEffect(() => {
    const el = getViewport();
    if (!el || !followingRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [turns, life, interim, getViewport]);

  // Optional scroll linking: when panels are side by side the conversation and
  // ideas can follow each other proportionally, or stay independent.
  const ideasScrollRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    if (!sideBySide || (prefs.scrollSync ?? "independent") !== "linked") return;
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
  }, [sideBySide, prefs.scrollSync, getViewport]);

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

  React.useEffect(() => {
    if (!isDesktop) return;
    if (suspended) {
      if (life === "running") {
        resumeLifeRef.current = "running";
        transcriber.setPaused(true);
        setLife("paused");
      }
      return;
    }
    if (resumeLifeRef.current === "running" && life === "paused") {
      resumeLifeRef.current = null;
      transcriber.setPaused(false);
      setLife("running");
    }
    // Intentionally omit `transcriber`: only react to shell suspend / life.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setPaused is stable enough for suspend
  }, [suspended, isDesktop, life]);

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
    onExitHome?.();
  };

  const active = life === "running" || life === "paused" || life === "preparing";

  React.useEffect(() => {
    if (!active || !startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active, startedAt]);

  const askIdeas = React.useCallback(() => {
    const lastOther = [...turnsRef.current].reverse().find((x) => x.speaker === "other");
    const text = lastOther?.text.trim();
    if (!text || streaming) return;
    hapticTap(8);
    runSuggestions(text);
  }, [runSuggestions, streaming]);

  const lastSession = history[0] ?? null;
  const locale = prefs.uiLang === "zh" ? "zh-CN" : prefs.uiLang === "ja" ? "ja-JP" : "en";
  const configLine = [
    langLabel(prefs.conversationLang, prefs.uiLang),
    levelLabel(prefs.level, prefs.uiLang),
    t("translateInto").replace("{lang}", langLabel(prefs.translateLang, prefs.uiLang)),
  ].join(" · ");
  const sample =
    prefs.conversationLang === "ja"
      ? { text: t("sampleJa"), meaning: t("sampleJaMeaning") }
      : prefs.conversationLang === "zh"
        ? { text: t("sampleZh"), meaning: t("sampleZhMeaning") }
        : { text: t("sampleEn"), meaning: t("sampleEnMeaning") };

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

  const ideasView = (
    <SuggestionStage
      scrollRef={ideasScrollRef}
      className="min-h-0 flex-1"
      fontScale={prefs.suggestionFontScale}
      scrolling={transcriber.holding !== null}
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
        retry: t("retry"),
      }}
      emptyHint={t("emptySuggestions")}
      previousRoundLabel={t("previousRound")}
    />
  );

  const elapsedLabel =
    active && startedAt ? formatElapsed(now - startedAt) : "00:00";

  const openLastSession = () => {
    if (onOpenHistory) {
      onOpenHistory();
      return;
    }
    if (!lastSession) return;
    setHistoryFocusId(lastSession.id);
    setHistoryOpen(true);
  };

  const desktopRail = isDesktop ? (
    <aside className="desktop-aside panel-sheet flex min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-[1.2] flex-col border-b border-[oklch(35%_0.02_80_/_0.08)] p-3.5">
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          <Lightbulb className="size-3" />
          {t("suggestions")}
        </p>
        {active ? (
          ideasView
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("desktopSuggestionsHint")}
          </p>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col p-3.5">
        <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("conversationHistory")}
        </p>
        {active ? (
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
            <ul className="space-y-2">
              {turns.length === 0 ? (
                <li className="py-2 text-center text-xs text-muted-foreground">
                  {t("noTranscript")}
                </li>
              ) : (
                turns.map((turn) => (
                  <li
                    key={turn.id}
                    className={cn(
                      "text-xs leading-relaxed",
                      turn.speaker === "user" ? "text-right" : "text-left",
                    )}
                  >
                    <span className="font-semibold text-muted-foreground">
                      {turn.speaker === "user" ? t("me") : t("other")}
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
                      {turn.text}
                    </p>
                    {turn.translation ? (
                      <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                        {turn.translation}
                      </p>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : lastSession ? (
          <button
            type="button"
            onClick={openLastSession}
            className="w-full rounded-md border border-[oklch(100%_0_0_/_0.22)] bg-[oklch(100%_0_0_/_0.12)] px-3 py-3 text-left transition hover:border-[var(--glass-border-vivid)]"
          >
            <p className="text-[13px] font-semibold tracking-tight">
              {t("lastSession")} ·{" "}
              {new Intl.DateTimeFormat(locale, {
                month: "short",
                day: "numeric",
              }).format(new Date(lastSession.startedAt))}
            </p>
            <p className="mt-1 line-clamp-4 text-xs leading-relaxed text-muted-foreground">
              {lastSession.summary?.trim() || t("desktopTranscriptHint")}
            </p>
          </button>
        ) : (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("desktopTranscriptHint")}
          </p>
        )}
      </div>
    </aside>
  ) : null;

  const shellClass = isDesktop
    ? "desktop-split h-full"
    : "mx-auto flex h-dvh max-w-6xl flex-col gap-2 overflow-hidden px-3 pt-2 sm:gap-3 sm:px-6 sm:pt-4";

  const mainClass = isDesktop
    ? "desktop-main panel-sheet flex min-h-0 flex-col gap-2 overflow-hidden px-3 pt-2"
    : "contents";

  return (
    <div
      className={shellClass}
      style={
        isDesktop
          ? undefined
          : {
              paddingTop: "max(0.5rem, env(safe-area-inset-top))",
            }
      }
    >
      <div className={mainClass}>
      <header
        className={cn(
          "flex shrink-0 items-center gap-2 px-2.5 py-1.5 sm:px-3 sm:py-2",
          isDesktop
            ? "border-b border-[oklch(35%_0.02_80_/_0.08)]"
            : "glass-bar rounded-xl sm:rounded-2xl",
        )}
      >
        {isDesktop ? null : (
          <Button
            variant="soft"
            size="icon"
            className="size-9 shrink-0 rounded-md"
            aria-label={t("settings")}
            onClick={() => setSettingsOpen(true)}
          >
            <Menu className="size-4" />
          </Button>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-display truncate text-sm font-bold tracking-tight">
            {isDesktop ? t("newChat") : t("appName")}
          </p>
          {active ? (
            <p className="mt-0.5 flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              {t("sessionLive")} · {elapsedLabel}
              <span className="text-muted-foreground/70">· {statusLabel}</span>
            </p>
          ) : null}
        </div>
        {onExitHome && !active ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 rounded-md px-2 text-xs"
            onClick={() => onExitHome()}
          >
            <ChevronLeft className="size-3.5" />
            {t("backHome")}
          </Button>
        ) : null}
        {isDesktop ? null : <AccountMenu compact />}
      </header>

      {error ? (
        <p className="shrink-0 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </p>
      ) : null}

      {!active ? (
        <main className="session-idle relative flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto py-1 pb-2">
          <section className="space-y-2 px-1 text-center">
            <p className="font-display text-[1.35rem] leading-snug font-bold tracking-tight sm:text-2xl">
              {configLine}
            </p>
            <div className="mx-auto max-w-sm">
              <p className="text-lg font-semibold tracking-tight">{sample.text}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{sample.meaning}</p>
            </div>
          </section>

          <section className="space-y-2">
            <p className="px-0.5 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
              {t("modeCardsLabel")}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  {
                    id: "push" as const,
                    title: t("pushMode"),
                    desc: t("pushModeDescription"),
                    icon: Mic,
                    onClick: () => setPrefs({ captureMode: "push" }),
                    selected: prefs.captureMode === "push",
                  },
                  {
                    id: "continuous" as const,
                    title: t("continuousMode"),
                    desc: t("continuousModeDescription"),
                    icon: Users,
                    onClick: () => setPrefs({ captureMode: "continuous" }),
                    selected: prefs.captureMode === "continuous",
                  },
                ] as const
              ).map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.id}
                    type="button"
                    onClick={card.onClick}
                    className={cn(
                      "session-mode-card panel-sheet flex flex-col gap-1.5 p-3 text-left transition",
                      card.selected && "session-mode-card-active",
                    )}
                  >
                    <span className="home-hub-tint flex size-8 items-center justify-center rounded-md">
                      <Icon className="size-3.5" strokeWidth={1.75} />
                    </span>
                    <span className="text-[13px] font-semibold tracking-tight">{card.title}</span>
                    <span className="text-[11px] leading-snug text-muted-foreground">
                      {card.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Desktop right rail already surfaces last-session / transcript hints. */}
          {isDesktop ? null : (
            <section className="space-y-2">
              <p className="px-0.5 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
                {t("lastSession")}
              </p>
              {lastSession ? (
                <button
                  type="button"
                  className="panel-sheet flex w-full flex-col gap-1.5 p-3.5 text-left transition hover:border-[var(--glass-border-vivid)]"
                  onClick={openLastSession}
                >
                  <p className="text-[14px] font-semibold tracking-tight">
                    {t("sessionLangTitle").replace(
                      "{lang}",
                      langLabel(lastSession.conversationLang, prefs.uiLang),
                    )}{" "}
                    ·{" "}
                    {new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(lastSession.startedAt))}
                  </p>
                  <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                    {lastSession.summary?.trim() || t("noHistory")}
                  </p>
                  <p className="text-[11px] font-medium text-muted-foreground">
                    {t("sessionMeta")
                      .replace("{n}", String(lastSession.turns.length))
                      .replace(
                        "{m}",
                        String(
                          Math.max(
                            1,
                            Math.round(
                              (lastSession.endedAt - lastSession.startedAt) / 60_000,
                            ),
                          ),
                        ),
                      )}
                  </p>
                </button>
              ) : (
                <div className="panel-sheet px-3.5 py-4 text-center text-sm text-muted-foreground">
                  {t("lastSessionEmpty")}
                </div>
              )}
            </section>
          )}
        </main>
      ) : (
        (() => {
          const latestTurn = turns[turns.length - 1];
          const liveOther = interim.other.trim();
          const liveUser = interim.user.trim();
          const captionPrimary =
            liveOther || liveUser || latestTurn?.text.trim() || "";
          const captionSecondary =
            !liveOther && !liveUser && latestTurn?.speaker === "other"
              ? latestTurn.translation?.trim() || ""
              : "";

          const cloudLevel = transcriber.recording
            ? Math.max(0.18, Math.min(1, transcriber.level))
            : streaming
              ? 0.4
              : life === "paused"
                ? 0.05
                : 0.12;

          const transcriptBlock = isDesktop ? null : (
            <section className="panel-sheet shrink-0 overflow-hidden">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
                aria-expanded={transcriptOpen}
                onClick={() => setTranscriptOpen((v) => !v)}
              >
                <span className="text-[12px] font-semibold tracking-tight">
                  {t("conversationHistory")}
                </span>
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  {transcriptOpen ? t("collapseTranscript") : t("expandTranscript")}
                  {transcriptOpen ? (
                    <ChevronUp className="size-3.5" />
                  ) : (
                    <ChevronDown className="size-3.5" />
                  )}
                </span>
              </button>
              {transcriptOpen ? (
                <div
                  ref={scrollRef}
                  className="max-h-40 overflow-y-auto border-t border-[oklch(35%_0.02_80_/_0.08)] px-3 py-2"
                >
                  <ul className="space-y-2">
                    {turns.length === 0 ? (
                      <li className="py-2 text-center text-xs text-muted-foreground">
                        {t("noTranscript")}
                      </li>
                    ) : (
                      turns.map((turn) => (
                        <li
                          key={turn.id}
                          className={cn(
                            "text-xs leading-relaxed",
                            turn.speaker === "user" ? "text-right" : "text-left",
                          )}
                        >
                          <span className="font-semibold text-muted-foreground">
                            {turn.speaker === "user" ? t("me") : t("other")}
                          </span>
                          <p className="mt-0.5 whitespace-pre-wrap break-words text-foreground">
                            {turn.text}
                          </p>
                          {turn.translation ? (
                            <p className="mt-0.5 text-[11px] italic text-muted-foreground">
                              {turn.translation}
                            </p>
                          ) : null}
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </section>
          );

          const stage = (
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-2 py-1">
              <div className="flex min-h-[3.5rem] w-full max-w-lg flex-col items-center justify-end gap-1 px-3 text-center">
                {captionPrimary ? (
                  <>
                    <p className="idea-rise max-w-full text-[1.25rem] leading-snug font-bold tracking-tight text-foreground sm:text-2xl">
                      {captionPrimary}
                    </p>
                    {captionSecondary ? (
                      <p className="max-w-[20rem] text-sm leading-relaxed text-muted-foreground">
                        {captionSecondary}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("waitingForOther")}</p>
                )}
              </div>
              <VoiceCloud
                size={wide && sideBySide ? "md" : "lg"}
                active={transcriber.recording || streaming}
                level={cloudLevel}
              />
            </div>
          );

          if (isDesktop) {
            return (
              <main className="relative flex min-h-0 flex-1 flex-col gap-2 py-1">
                {stage}
              </main>
            );
          }

          if (sideBySide && wide) {
            return (
              <main className="relative flex min-h-0 flex-1 gap-4 py-1">
                <section className="flex min-h-0 min-w-0 flex-[1.15] flex-col gap-2">
                  {transcriptBlock}
                  {stage}
                </section>
                <section className="panel-sheet flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3.5">
                  <p className="mb-1.5 flex items-center gap-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    <Lightbulb className="size-3" />
                    {t("suggestions")}
                  </p>
                  {ideasView}
                </section>
              </main>
            );
          }

          return (
            <main className="relative flex min-h-0 flex-1 flex-col gap-2 py-1">
              {transcriptBlock}
              {stage}
              <section className="panel-sheet relative flex min-h-0 flex-[1.05] flex-col overflow-hidden px-3 py-2.5 sm:p-3.5">
                <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase sm:text-[11px]">
                  <Lightbulb className="size-3" />
                  {t("suggestions")}
                </p>
                {ideasView}
              </section>
            </main>
          );
        })()
      )}

      <div
        aria-hidden
        className={cn("shrink-0", isDesktop ? "hidden" : "sm:hidden")}
        style={{ height: Math.max(dockHeight + 4, 72) }}
      />

      <div
        ref={dockRef}
        className={cn(
          "glass-bar z-30 flex flex-col gap-1.5 px-3 py-2",
          isDesktop
            ? "sticky bottom-0 mb-2 rounded-xl border px-4 py-2.5 shadow-none"
            : cn(
                "fixed inset-x-0 bottom-0 rounded-b-none rounded-t-xl border-x-0 border-b-0 shadow-[0_-8px_24px_-12px_oklch(0%_0_0_/_0.18)]",
                dockStyle === "float" && "inset-x-3 bottom-3 rounded-xl border",
                "sm:sticky sm:inset-x-auto sm:bottom-0 sm:mb-2 sm:rounded-xl sm:border sm:px-4 sm:py-2.5 sm:shadow-none",
              ),
        )}
        style={
          {
            paddingBottom: isDesktop
              ? "0.5rem"
              : "max(0.5rem, env(safe-area-inset-bottom))",
            "--dock-scale": String(dockScale),
          } as React.CSSProperties
        }
      >
        {active && life !== "preparing" ? (
          prefs.captureMode === "push" ? (
            <div className="flex gap-2">
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
                  hotkey={who === "other" ? "a" : "d"}
                  onBegin={() => transcriber.beginTurn(who)}
                  onEnd={() => transcriber.endTurn()}
                />
              ))}
            </div>
          ) : (
            <div className="flex gap-1 rounded-md bg-muted/60 p-1">
              {(["other", "user"] as const).map((who) => (
                <button
                  key={who}
                  type="button"
                  onClick={() => {
                    hapticTap(6);
                    setSpeaker(who);
                  }}
                  className={cn(
                    "flex-1 rounded-md px-3 py-2 text-xs font-semibold transition",
                    speaker === who
                      ? "bg-primary/85 text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {who === "other" ? t("other") : t("me")}
                </button>
              ))}
            </div>
          )
        ) : null}

        <div
          className={cn(
            "flex gap-2 transition-opacity",
            active && life !== "preparing" && "border-t border-border/50 pt-1.5",
            transcriber.holding && "pointer-events-none opacity-40",
          )}
        >
          {!active ? (
            <>
              <Button
                variant="soft"
                className="h-12 w-12 shrink-0 rounded-md p-0"
                disabled
                aria-label={t("pause")}
              >
                <Pause className="size-4 opacity-40" />
              </Button>
              <Button
                className="h-12 flex-1 rounded-md text-[15px] font-semibold"
                onClick={() => void startSession()}
              >
                <Play className="size-4 fill-current" />
                {t("start")}
              </Button>
              <Button
                variant="soft"
                className="h-12 shrink-0 rounded-md px-3 text-xs"
                disabled
                aria-label={t("askIdeas")}
              >
                <Lightbulb className="size-4 opacity-40" />
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="soft"
                className="h-12 w-12 shrink-0 rounded-md p-0 sm:h-11 sm:w-auto sm:px-5"
                disabled={life === "preparing"}
                onClick={togglePause}
                aria-label={life === "paused" ? t("resume") : t("pause")}
              >
                {life === "paused" ? <Play className="size-4" /> : <Pause className="size-4" />}
                <span className="hidden sm:inline">
                  {life === "paused" ? t("resume") : t("pause")}
                </span>
              </Button>
              <Button
                className="h-12 flex-1 rounded-md text-[15px] font-semibold sm:h-11"
                onClick={() => setConfirmStop(true)}
              >
                {t("stopAndSave")}
              </Button>
              <Button
                variant="soft"
                className="h-12 shrink-0 rounded-md px-3 text-xs sm:h-11"
                disabled={
                  life === "preparing" ||
                  life === "paused" ||
                  streaming ||
                  !turns.some((x) => x.speaker === "other")
                }
                onClick={askIdeas}
                aria-label={t("askIdeas")}
                title={t("askIdeas")}
              >
                <Lightbulb className="size-4" />
                <span className="ml-1 hidden sm:inline">{t("askIdeas")}</span>
              </Button>
            </>
          )}
        </div>
      </div>
      </div>

      {desktopRail}

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

      {!isDesktop ? (
        <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} locked={active} />
      ) : null}
      {!isDesktop ? (
        <HistorySheet
          open={historyOpen}
          onOpenChange={(v) => {
            setHistoryOpen(v);
            if (!v) setHistoryFocusId(null);
          }}
          focusId={historyFocusId}
        />
      ) : null}
      <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
      {!isDesktop ? <OnboardingTour onOpenGuide={() => setGuideOpen(true)} /> : null}
      {prefs.showVadDiagnostics ? (
        <VadDiagnostics
          diagnostics={transcriber.diagnostics}
          mode={prefs.captureMode}
          uiLang={prefs.uiLang}
          recording={transcriber.recording}
          className="fixed bottom-24 left-3 right-3 z-40 sm:bottom-28 sm:left-auto sm:right-6 sm:w-80"
        />
      ) : null}
    </div>
  );
}


function sourceKey(source: "microphone" | "system" | "both") {
  return source === "microphone" ? "microphone" : source === "system" ? "systemAudio" : "bothAudio";
}
