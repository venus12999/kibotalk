import * as React from "react";
import { AudioLines } from "lucide-react";
import { useKibo } from "@/lib/kibo/store";
import { AppBackground } from "./app-background";
import { DesktopShell, type DesktopNav, useDesktopShell } from "./desktop-shell";
import { DesktopHistoryPanel } from "./desktop-history-panel";
import { HomeHub } from "./home-hub";
import { SessionWorkbench } from "./session-workbench";
import { SettingsSheet } from "./settings-sheet";
import { GuideSheet } from "./guide-sheet";
import { Onboarding } from "./onboarding";

type Screen = "onboarding" | "home" | "session";

type Props = {
  screen: Screen;
  setScreen: (s: Screen) => void;
};

/**
 * Desktop entry: left rail + body. Mobile keeps HomeHub / SessionWorkbench as-is.
 */
export function DesktopApp({ screen, setScreen }: Props) {
  const desktop = useDesktopShell();
  const { t } = useKibo();
  const [nav, setNav] = React.useState<DesktopNav>("conversation");
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);

  // Keep session mounted when browsing history so a live talk isn't torn down.
  const sessionMounted = screen === "session";

  const onNavigate = React.useCallback((next: DesktopNav) => {
    if (next === "settings") {
      setSettingsOpen(true);
      return;
    }
    if (next === "guide") {
      setGuideOpen(true);
      return;
    }
    if (next === "memory") return; // handled in shell via router
    setNav(next);
  }, []);

  const startTalk = React.useCallback(() => {
    setNav("conversation");
    setScreen("session");
  }, [setScreen]);

  if (!desktop) {
    if (screen === "session") {
      return (
        <>
          <AppBackground pale />
          <SessionWorkbench onExitHome={() => setScreen("home")} />
        </>
      );
    }
    if (screen === "home") {
      return (
        <>
          <AppBackground pale />
          <HomeHub onStartTalk={() => setScreen("session")} />
        </>
      );
    }
    return (
      <>
        <AppBackground pale />
        <main className="flex min-h-dvh items-center justify-center p-4">
          <Onboarding onContinue={() => setScreen("home")} />
        </main>
      </>
    );
  }

  if (screen === "onboarding") {
    return (
      <>
        <AppBackground pale />
        <main className="flex min-h-dvh items-center justify-center p-4">
          <Onboarding onContinue={() => setScreen("home")} />
        </main>
      </>
    );
  }

  return (
    <>
      <AppBackground pale />
      <DesktopShell active={nav === "memory" ? "conversation" : nav} onNavigate={onNavigate}>
        {/* Keep the live session mounted while browsing history. */}
        <div className={nav === "history" ? "hidden h-full" : "h-full"}>
          {sessionMounted ? (
            <SessionWorkbench
              variant="desktop"
              suspended={nav === "history"}
              onExitHome={() => {
                setScreen("home");
                setNav("conversation");
              }}
              onOpenHistory={() => setNav("history")}
            />
          ) : (
            <DesktopConversationHome
              onStartTalk={startTalk}
              onOpenHistory={() => setNav("history")}
            />
          )}
        </div>
        {nav === "history" ? (
          <div className="h-full min-h-0">
            <DesktopHistoryPanel onStartTalk={startTalk} />
          </div>
        ) : null}
      </DesktopShell>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} locked={sessionMounted} />
      <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
      <span className="sr-only">{t("appName")}</span>
    </>
  );
}

/** Desktop idle conversation: greeting + CTA into session (modes live in session idle). */
function DesktopConversationHome({
  onStartTalk,
  onOpenHistory,
}: {
  onStartTalk: () => void;
  onOpenHistory: () => void;
}) {
  const { prefs, t, history } = useKibo();
  const last = history[0] ?? null;
  const locale = prefs.uiLang === "zh" ? "zh-CN" : prefs.uiLang === "ja" ? "ja-JP" : "en";

  return (
    <div className="desktop-split">
      <section className="desktop-main panel-sheet flex min-h-0 flex-col overflow-hidden">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[oklch(35%_0.02_80_/_0.08)] px-5 py-3">
          <h1 className="font-display text-lg font-bold tracking-tight">{t("newChat")}</h1>
        </header>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 px-6 py-8">
          <p className="font-display max-w-md text-center text-3xl font-bold tracking-tight">
            {t("homeGreeting")}
          </p>
          <p className="max-w-sm text-center text-sm leading-relaxed text-muted-foreground">
            {t("homeSubtitle")}
          </p>
          <button type="button" onClick={onStartTalk} className="home-pill-cta group max-w-xs">
            <span className="home-pill-cta-icon">
              <AudioLines className="size-4" strokeWidth={2} />
            </span>
            <span className="font-display flex-1 text-left text-[15px] font-bold tracking-tight">
              {t("homeStartTalk")}
            </span>
          </button>
        </div>
      </section>

      <aside className="desktop-aside panel-sheet flex min-h-0 flex-col gap-4 overflow-hidden p-4">
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("suggestions")}
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t("desktopSuggestionsHint")}
          </p>
        </div>
        <div className="min-h-0 flex-1 space-y-1.5">
          <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
            {t("conversationHistory")}
          </p>
          {last ? (
            <button
              type="button"
              onClick={onOpenHistory}
              className="w-full rounded-md border border-[oklch(100%_0_0_/_0.22)] bg-[oklch(100%_0_0_/_0.12)] px-3 py-3 text-left transition hover:border-[var(--glass-border-vivid)]"
            >
              <p className="text-[13px] font-semibold tracking-tight">
                {t("lastSession")} ·{" "}
                {new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                }).format(new Date(last.startedAt))}
              </p>
              <p className="mt-1 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {last.summary?.trim() || t("desktopTranscriptHint")}
              </p>
            </button>
          ) : (
            <p className="text-sm text-muted-foreground">{t("desktopTranscriptHint")}</p>
          )}
        </div>
      </aside>
    </div>
  );
}
