import * as React from "react";
import { ChevronDown, ChevronUp, MessageCircle, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";

export function HistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { history, t, prefs, deleteSession } = useKibo();
  const ui = prefs.uiLang;
  const locale = ui === "zh" ? "zh-CN" : ui === "ja" ? "ja-JP" : "en";
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const confirmDelete = () => {
    if (!pendingId) return;
    navigator.vibrate?.(12);
    deleteSession(pendingId);
    if (expandedId === pendingId) setExpandedId(null);
    setPendingId(null);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-[oklch(35%_0.02_80_/_0.06)] px-5 pt-5 pr-14 pb-3">
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{t("history")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-6rem)] px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          {history.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-2.5 py-3">
              {history.map((s) => {
                const openDetail = expandedId === s.id;
                const when = new Intl.DateTimeFormat(locale, {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(s.startedAt));
                const snippet =
                  s.summary?.trim() ||
                  s.turns.find((turn) => turn.text.trim())?.text.trim() ||
                  (ui === "zh"
                    ? "（暂无总结）"
                    : ui === "ja"
                      ? "（まとめなし）"
                      : "(No summary)");
                return (
                  <li key={s.id} className="panel-sheet overflow-hidden p-3">
                    <div className="flex items-start gap-3">
                      <span className="home-hub-tint flex size-9 shrink-0 items-center justify-center rounded-md">
                        <MessageCircle className="size-4" strokeWidth={1.75} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-[15px] font-semibold tracking-tight">
                              {t("sessionSummary")}
                            </p>
                            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">
                              {when} · {langLabel(s.conversationLang, ui)} ·{" "}
                              {levelLabel(s.level, ui)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t("deleteSession")}
                            title={t("deleteSession")}
                            className="-mr-1 -mt-1 size-8 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => setPendingId(s.id)}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                          {snippet}
                        </p>
                        <button
                          type="button"
                          className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] px-2.5 py-1.5 text-left text-xs font-semibold text-muted-foreground outline-none transition hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                          aria-expanded={openDetail}
                          onClick={() => setExpandedId(openDetail ? null : s.id)}
                        >
                          <span>
                            {t("conversationHistory")} · {s.turns.length}
                          </span>
                          {openDetail ? (
                            <ChevronUp className="size-3.5 shrink-0" />
                          ) : (
                            <ChevronDown className="size-3.5 shrink-0" />
                          )}
                        </button>
                        {openDetail ? (
                          s.turns.length === 0 ? (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {ui === "zh"
                                ? "这条会话没有转写内容。"
                                : ui === "ja"
                                  ? "この会話には文字起こしがありません。"
                                  : "No transcript lines in this session."}
                            </p>
                          ) : (
                            <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-2xl bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)] p-2.5">
                              {s.turns.map((turn) => (
                                <li
                                  key={turn.id}
                                  className={cn(
                                    "text-xs leading-relaxed",
                                    turn.speaker === "user" ? "text-right" : "text-left",
                                  )}
                                >
                                  <span className="inline-flex items-center gap-1 font-semibold text-muted-foreground">
                                    {turn.speaker !== "user" ? (
                                      <span className="size-1.5 rounded-full bg-primary" />
                                    ) : null}
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
                          )
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </SheetContent>

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
    </Sheet>
  );
}
