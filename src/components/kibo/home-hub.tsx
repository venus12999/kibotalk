import * as React from "react";
import {
  AudioLines,
  Brain,
  ChevronRight,
  HelpCircle,
  History,
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
 * Welcome / home (brief screen 1): brand claim, one CTA, explore with memory kept.
 */
export function HomeHub({ onStartTalk }: Props) {
  const { prefs, t } = useKibo();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [guideOpen, setGuideOpen] = React.useState(false);

  const explore = [
    {
      key: "memory",
      icon: Brain,
      label: t("navMemory"),
      hint: t("homeMemoryHint"),
      onClick: () => void navigate({ to: "/memory" }),
    },
    {
      key: "history",
      icon: History,
      label: t("navHistory"),
      hint: t("homeHistoryHint"),
      onClick: () => setHistoryOpen(true),
    },
    {
      key: "guide",
      icon: HelpCircle,
      label: t("navGuide"),
      hint: t("homeGuideHint"),
      onClick: () => setGuideOpen(true),
    },
    {
      key: "settings",
      icon: Settings,
      label: t("settings"),
      hint: t("homeSettingsHint"),
      onClick: () => setSettingsOpen(true),
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
            {t("homeTagline")}
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

        <div className="space-y-2 text-center">
          <h1 className="font-display text-[1.55rem] leading-tight font-bold tracking-tight text-foreground sm:text-[1.75rem]">
            {t("homeGreeting")}
          </h1>
          <p className="mx-auto max-w-[18rem] text-[13px] leading-relaxed text-muted-foreground">
            {t("homeSubtitle")}
          </p>
          <p className="text-[11px] font-medium text-muted-foreground/80">
            {langLabel(prefs.conversationLang, prefs.uiLang)} ·{" "}
            {levelLabel(prefs.level, prefs.uiLang)}
          </p>
        </div>

        <button type="button" onClick={onStartTalk} className="home-pill-cta group">
          <span className="home-pill-cta-icon">
            <AudioLines className="size-4" strokeWidth={2} />
          </span>
          <span className="font-display flex-1 text-left text-[15px] font-bold tracking-tight">
            {t("homeStartTalk")}
          </span>
          <ChevronRight className="size-4 opacity-50 transition group-hover:translate-x-0.5 group-hover:opacity-80" />
        </button>

        <section className="w-full max-w-sm space-y-2">
          <p className="px-0.5 text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">
            {t("homeExplore")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {explore.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={item.onClick}
                  className={cn(
                    "panel-sheet flex items-center gap-2.5 px-3 py-2.5 text-left transition",
                    "hover:border-[var(--glass-border-vivid)] active:scale-[0.99]",
                  )}
                >
                  <span className="home-hub-tint flex size-8 shrink-0 items-center justify-center rounded-md">
                    <Icon className="size-3.5" strokeWidth={1.75} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold tracking-tight">
                      {item.label}
                    </span>
                    <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">
                      {item.hint}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      </main>

      <SettingsSheet open={settingsOpen} onOpenChange={setSettingsOpen} locked={false} />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />
      <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  );
}
