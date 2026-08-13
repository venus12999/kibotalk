import * as React from "react";
import { MessageCircle, Trash2 } from "lucide-react";
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
import { langLabel, useKibo } from "@/lib/kibo/store";
import type { ConvLang, SessionRecord, UiLang } from "@/lib/kibo/types";

function sessionMinutes(startedAt: number, endedAt: number) {
  return Math.max(1, Math.round(Math.max(0, endedAt - startedAt) / 60_000));
}

type Props = {
  onStartTalk: () => void;
};

/**
 * Desktop history: list + detail.
 * No fake fluency / pronunciation scores — product does not ship those.
 */
export function DesktopHistoryPanel({ onStartTalk }: Props) {
  const { history, t, prefs, deleteSession } = useKibo();
  const ui = prefs.uiLang;
  const locale = ui === "zh" ? "zh-CN" : ui === "ja" ? "ja-JP" : "en";
  const [langFilter, setLangFilter] = React.useState<"all" | ConvLang>("all");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const filters: { id: "all" | ConvLang; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "zh", label: t("languageChinese") },
    { id: "en", label: t("languageEnglish") },
    { id: "ja", label: t("languageJapanese") },
  ];

  const rows =
    langFilter === "all" ? history : history.filter((s) => s.conversationLang === langFilter);

  React.useEffect(() => {
    if (!rows.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !rows.some((r) => r.id === selectedId)) {
      setSelectedId(rows[0]!.id);
    }
  }, [rows, selectedId]);

  const selected = rows.find((s) => s.id === selectedId) ?? null;

  const confirmDelete = () => {
    if (!pendingId) return;
    deleteSession(pendingId);
    setPendingId(null);
  };

  return (
    <div className="desktop-split">
      <section className="desktop-main panel-sheet flex min-h-0 flex-col gap-3 overflow-hidden p-4">
        <header className="flex shrink-0 items-center justify-between gap-3">
          <h1 className="font-display text-lg font-bold tracking-tight">{t("history")}</h1>
          <Button className="rounded-md" size="sm" onClick={onStartTalk}>
            {t("start")}
          </Button>
        </header>

        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => {
            const active = langFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setLangFilter(f.id)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-[12px] font-medium transition",
                  active
                    ? "bg-primary/85 text-primary-foreground"
                    : "border border-[oklch(100%_0_0_/_0.28)] bg-[oklch(100%_0_0_/_0.14)] text-muted-foreground hover:text-foreground",
                )}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
        ) : (
          <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
            {rows.map((s) => (
              <HistoryRow
                key={s.id}
                session={s}
                selected={selectedId === s.id}
                locale={locale}
                ui={ui}
                onSelect={() => setSelectedId(s.id)}
                onDelete={() => setPendingId(s.id)}
              />
            ))}
          </ul>
        )}
      </section>

      <aside className="desktop-aside panel-sheet min-h-0 overflow-hidden">
        <HistoryDetail session={selected} onStartTalk={onStartTalk} />
      </aside>

      <AlertDialog open={pendingId !== null} onOpenChange={(v) => !v && setPendingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteSessionTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("deleteSessionDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>{t("deleteSession")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function HistoryRow({
  session: s,
  selected,
  locale,
  ui,
  onSelect,
  onDelete,
}: {
  session: SessionRecord;
  selected: boolean;
  locale: string;
  ui: UiLang;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const { t } = useKibo();
  const when = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(s.startedAt));
  const lang = langLabel(s.conversationLang, ui);
  const title = t("sessionLangTitle").replace("{lang}", lang);
  const snippet =
    s.summary?.trim() ||
    s.turns.find((turn) => turn.text.trim())?.text.trim() ||
    t("noHistory");
  const meta = t("sessionMeta")
    .replace("{n}", String(s.turns.length))
    .replace("{m}", String(sessionMinutes(s.startedAt, s.endedAt)));

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition",
          selected
            ? "border-[color-mix(in_oklab,var(--primary)_45%,var(--glass-border))] bg-[color-mix(in_oklab,var(--primary-soft)_40%,transparent)]"
            : "border-[oklch(100%_0_0_/_0.22)] bg-[oklch(100%_0_0_/_0.12)] hover:border-[var(--glass-border-vivid)]",
        )}
      >
        <span className="home-hub-tint flex size-9 shrink-0 items-center justify-center rounded-md">
          <MessageCircle className="size-4" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold tracking-tight">
            {title} · {when}
          </span>
          <span className="mt-1 line-clamp-2 block text-sm text-muted-foreground">{snippet}</span>
          <span className="mt-1.5 block text-[11px] text-muted-foreground">{meta}</span>
        </span>
        <span
          role="button"
          tabIndex={0}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={t("deleteSession")}
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }
          }}
        >
          <Trash2 className="size-3.5" />
        </span>
      </button>
    </li>
  );
}

function HistoryDetail({
  session,
  onStartTalk,
}: {
  session: SessionRecord | null;
  onStartTalk: () => void;
}) {
  const { t, prefs } = useKibo();
  if (!session) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {t("noHistory")}
      </div>
    );
  }
  const ui = prefs.uiLang;
  const locale = ui === "zh" ? "zh-CN" : ui === "ja" ? "ja-JP" : "en";
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(session.startedAt));

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div>
        <p className="font-display text-base font-bold tracking-tight">
          {t("sessionLangTitle").replace("{lang}", langLabel(session.conversationLang, ui))}
        </p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{when}</p>
      </div>

      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("sessionSummary")}
        </p>
        <p className="text-sm leading-relaxed">{session.summary?.trim() || t("noHistory")}</p>
        <p className="text-[11px] text-muted-foreground">
          {t("sessionMeta")
            .replace("{n}", String(session.turns.length))
            .replace("{m}", String(sessionMinutes(session.startedAt, session.endedAt)))}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1.5">
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          {t("sessionDetails")}
        </p>
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-md bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] p-2.5">
          {session.turns.length === 0 ? (
            <li className="py-4 text-center text-xs text-muted-foreground">{t("noTranscript")}</li>
          ) : (
            session.turns.map((turn) => (
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
                <p className="mt-0.5 whitespace-pre-wrap break-words">{turn.text}</p>
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

      <Button className="w-full rounded-md" onClick={onStartTalk}>
        {t("startAnother")}
      </Button>
    </div>
  );
}
