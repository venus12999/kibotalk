import * as React from "react";
import {
  AudioLines,
  Brain,
  ChevronRight,
  HelpCircle,
  History,
  Home,
  Settings,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import { AccountMenu } from "./account-menu";
import { UiLanguageMenu } from "./ui-language-menu";
import { SettingsSheet } from "./settings-sheet";
import { HistorySheet } from "./history-sheet";
import { GuideSheet } from "./guide-sheet";
import { VoiceCloud } from "./voice-cloud";
import { cn } from "@/lib/utils";

type Props = {
  onStartTalk: () => void;
};

/**
 * Post-login home inspired by the warm orb + dock reference —
 * not a 1:1 clone; only features we actually ship.
 */
export function HomeHub({ onStartTalk }: Props) {
  const { prefs, t } = useKibo();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);

  const dock = [
    {
      key: "memory",
      icon: Brain,
      label: t("navMemory"),
      onClick: () => void navigate({ to: "/memory" }),
    },
    {
      key: "history",
      icon: History,
      label: t("navHistory"),
      onClick: () => setHistoryOpen(true),
    },
    {
      key: "home",
      icon: Home,
      label: t("homeDockHome"),
      onClick: onStartTalk,
      primary: true,
    },
    {
      key: "settings",
      icon: Settings,
      label: t("settings"),
      onClick: () => setSettingsOpen(true),
    },
    {
      key: "guide",
      icon: HelpCircle,
      label: t("navGuide"),
      onClick: () => setGuideOpen(true),
    },
  ] as const;

  return (
    <div
      className="home-hub"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
      }}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 py-1">
        <div className="min-w-0">
          <p className="font-display text-[1.25rem] leading-none font-bold tracking-tight text-foreground">
            {t("appName")}
          </p>
          <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
            {langLabel(prefs.conversationLang, prefs.uiLang)} ·{" "}
            {levelLabel(prefs.level, prefs.uiLang)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <UiLanguageMenu compact />
          <AccountMenu compact />
        </div>
      </header>

      <main className="home-hub-main">
        <div className="home-orb-wrap">
          <VoiceCloud size="lg" level={0.08} />
        </div>

        <div className="text-center">
          <h1 className="font-display text-[1.65rem] leading-tight font-bold tracking-tight text-foreground sm:text-[1.85rem]">
            {t("homeGreeting")}
          </h1>
        </div>

        <button
          type="button"
          onClick={onStartTalk}
          className="home-pill-cta group"
        >
          <span className="home-pill-cta-icon">
            <AudioLines className="size-4" strokeWidth={2} />
          </span>
          <span className="font-display flex-1 text-left text-[15px] font-bold tracking-tight">
            {t("homeStartTalk")}
          </span>
          <ChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
        </button>
      </main>

      <nav className="home-dock" aria-label={t("appName")}>
        {dock.map((item) => {
          const Icon = item.icon;
          const isPrimary = "primary" in item && item.primary;
          return (
            <button
              type="button"
              key={item.key}
              onClick={item.onClick}
              className={cn("home-dock-item", isPrimary && "home-dock-item-primary")}
              aria-label={item.label}
            >
              <span className={cn("home-dock-icon", isPrimary && "home-dock-icon-primary")}>
                <Icon className={isPrimary ? "size-5" : "size-[1.15rem]"} strokeWidth={1.75} />
              </span>
              <span className="home-dock-label">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} locked={false} />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
