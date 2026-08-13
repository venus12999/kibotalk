import * as React from "react";
import {
  Brain,
  HelpCircle,
  History,
  MessageCircle,
  Settings,
} from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { useKibo } from "@/lib/kibo/store";
import { AccountMenu } from "./account-menu";
import { cn } from "@/lib/utils";

export type DesktopNav = "conversation" | "history" | "memory" | "guide" | "settings";

type Props = {
  active: DesktopNav;
  onNavigate: (nav: DesktopNav) => void;
  children: React.ReactNode;
};

/**
 * Desktop left-rail chrome from the PC mock —
 * only real product destinations (no Discover / Agents / Membership).
 */
export function DesktopShell({ active, onNavigate, children }: Props) {
  const { t } = useKibo();
  const navigate = useNavigate();

  const items: {
    id: DesktopNav;
    label: string;
    icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
    action: () => void;
  }[] = [
    {
      id: "conversation",
      label: t("navConversation"),
      icon: MessageCircle,
      action: () => onNavigate("conversation"),
    },
    {
      id: "history",
      label: t("navHistory"),
      icon: History,
      action: () => onNavigate("history"),
    },
    {
      id: "memory",
      label: t("navMemory"),
      icon: Brain,
      action: () => void navigate({ to: "/memory" }),
    },
    {
      id: "guide",
      label: t("navGuide"),
      icon: HelpCircle,
      action: () => onNavigate("guide"),
    },
    {
      id: "settings",
      label: t("settings"),
      icon: Settings,
      action: () => onNavigate("settings"),
    },
  ];

  return (
    <div className="desktop-shell">
      <aside className="desktop-rail panel-sheet" aria-label={t("appName")}>
        <div className="px-3 pt-4 pb-2">
          <p className="font-display text-base font-bold tracking-tight">{t("appName")}</p>
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{t("homeTagline")}</p>
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {items.map((item) => {
            const Icon = item.icon;
            const selected = active === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={item.action}
                className={cn("desktop-rail-item", selected && "desktop-rail-item-active")}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="mt-auto border-t border-[oklch(35%_0.02_80_/_0.08)] px-2 py-3">
          <div className="flex items-center gap-2 rounded-md px-1 py-1">
            <AccountMenu compact />
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold">{t("navAccount")}</p>
              <p className="truncate text-[10px] text-muted-foreground">{t("homeMemoryHint")}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="desktop-body min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Hook: treat 960px+ as desktop shell breakpoint. */
export function useDesktopShell() {
  const [desktop, setDesktop] = React.useState(false);
  React.useEffect(() => {
    const mql = window.matchMedia("(min-width: 960px)");
    const onChange = () => setDesktop(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, []);
  return desktop;
}
