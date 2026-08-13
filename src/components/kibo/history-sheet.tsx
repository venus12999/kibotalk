import * as React from "react";
import { ChevronRight, MessageCircle, Search, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { useKibo, langLabel } from "@/lib/kibo/store";
import type { ConvLang } from "@/lib/kibo/types";
import { OverlayFrame, type OverlayPresentation } from "./overlay-frame";

function sessionMinutes(startedAt: number, endedAt: number) {
  const ms = Math.max(0, endedAt - startedAt);
  return Math.max(1, Math.round(ms / 60_000));
}

export function HistorySheet({
  open,
  onOpenChange,
  focusId,
  presentation = "sheet",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** When set, expand this session once the sheet opens. */
  focusId?: string | null;
  presentation?: OverlayPresentation;
}) {
  const { history, t, prefs, deleteSession } = useKibo();
  const ui = prefs.uiLang;
  const locale = ui === "zh" ? "zh-CN" : ui === "ja" ? "ja-JP" : "en";
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [langFilter, setLangFilter] = React.useState<"all" | ConvLang>("all");

  React.useEffect(() => {
    if (open && focusId) setExpandedId(focusId);
  }, [open, focusId]);

  const confirmDelete = () => {
    if (!pendingId) return;
    navigator.vibrate?.(12);
    deleteSession(pendingId);
    if (expandedId === pendingId) setExpandedId(null);
    setPendingId(null);
  };

  const filters: { id: "all" | ConvLang; label: string }[] = [
    { id: "all", label: t("filterAll") },
    { id: "zh", label: t("languageChinese") },
    { id: "en", label: t("languageEnglish") },
    { id: "ja", label: t("languageJapanese") },
  ];

  const rows =
    langFilter === "all" ? history : history.filter((s) => s.conversationLang === langFilter);

  return (
    <>
      <OverlayFrame
        open={open}
        onOpenChange={onOpenChange}
        presentation={presentation}
        title={t("history")}
        headerExtra={
          <span
            className="flex size-8 items-center justify-center rounded-md border border-[oklch(100%_0_0_/_0.28)] bg-[oklch(100%_0_0_/_0.18)] text-muted-foreground"
            aria-label={t("historySearch")}
            title={t("historySearch")}
          >
            <Search className="size-3.5" />
          </span>
        }
      >
        <ScrollArea
          className={cn(
            "px-4",
            presentation === "dialog"
              ? "h-[min(70dvh,40rem)] pb-6"
              : "h-[calc(100dvh-6rem)] pb-[max(2rem,env(safe-area-inset-bottom))]",
          )}
        >
          <div className="flex flex-wrap gap-1.5 py-3">
            {filters.map((f) => {
              const selected = langFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLangFilter(f.id)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-[12px] font-medium transition",
                    selected
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
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-2.5 pb-3">
              {rows.map((s) => {
                const openDetail = expandedId === s.id;
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
                  (ui === "zh"
                    ? "（暂无总结）"
                    : ui === "ja"
                      ? "（まとめなし）"
                      : "(No summary)");
                const mins = sessionMinutes(s.startedAt, s.endedAt);
                const meta = t("sessionMeta")
                  .replace("{n}", String(s.turns.length))
                  .replace("{m}", String(mins));
                return (
                  <li key={s.id} className="panel-sheet overflow-hidden p-3">
                    <div className="flex items-start gap-3">
                      <span className="home-hub-tint flex size-9 shrink-0 items-center justify-center rounded-md">
                        <MessageCircle className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            className="min-w-0 flex-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-expanded={openDetail}
                            onClick={() => setExpandedId(openDetail ? null : s.id)}
                          >
                            <p className="truncate text-[15px] font-semibold tracking-tight">
                              {title} · {when}
                            </p>
                            <p className="mt-1 line-clamp-1 text-sm leading-relaxed text-muted-foreground">
                              {snippet}
                            </p>
                            <p className="mt-1.5 text-[11px] font-medium text-muted-foreground">
                              {meta}
                            </p>
                          </button>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={t("deleteSession")}
                              title={t("deleteSession")}
                              className="size-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setPendingId(s.id)}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                            <button
                              type="button"
                              className="flex size-8 items-center justify-center text-muted-foreground"
                              aria-label={openDetail ? t("collapseTranscript") : t("expandTranscript")}
                              onClick={() => setExpandedId(openDetail ? null : s.id)}
                            >
                              <ChevronRight
                                className={cn(
                                  "size-4 transition-transform",
                                  openDetail && "rotate-90",
                                )}
                              />
                            </button>
                          </div>
                        </div>

                        {openDetail ? (
                          <div className="mt-3 space-y-2 border-t border-[oklch(35%_0.02_80_/_0.08)] pt-3">
                            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                              {t("sessionSummary")}
                            </p>
                            <p className="text-sm leading-relaxed text-foreground">
                              {s.summary?.trim() || snippet}
                            </p>
                            <p className="pt-1 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                              {t("sessionDetails")}
                            </p>
                            {s.turns.length === 0 ? (
                              <p className="text-xs text-muted-foreground">
                                {ui === "zh"
                                  ? "这条会话没有转写内容。"
                                  : ui === "ja"
                                    ? "この会話には文字起こしがありません。"
                                    : "No transcript lines in this session."}
                              </p>
                            ) : (
                              <ul className="max-h-64 space-y-2 overflow-y-auto rounded-md bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] p-2.5">
                                {s.turns.map((turn) => (
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
                                ))}
                              </ul>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </OverlayFrame>

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
    </>
  );
}
