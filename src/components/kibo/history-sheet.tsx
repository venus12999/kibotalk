import * as React from "react";
import { ChevronDown, ChevronUp, Trash2 } from "lucide-react";
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
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("history")}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-6rem)] px-4 pb-8">
          {history.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t("noHistory")}</p>
          ) : (
            <ul className="space-y-3 py-2">
              {history.map((s) => {
                const openDetail = expandedId === s.id;
                return (
                  <li key={s.id} className="rounded-md border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <p className="text-xs font-semibold text-muted-foreground">
                        {new Intl.DateTimeFormat(locale, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(s.startedAt))}{" "}
                        · {langLabel(s.conversationLang, ui)} · {levelLabel(s.level, ui)}
                      </p>
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
                    <p className="mt-2 text-sm font-semibold">{t("sessionSummary")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {s.summary?.trim()
                        ? s.summary
                        : ui === "zh"
                          ? "（暂无总结）"
                          : ui === "ja"
                            ? "（まとめなし）"
                            : "(No summary)"}
                    </p>
                    <button
                      type="button"
                      className="mt-2 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
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
                        <ul className="mt-2 max-h-64 space-y-2 overflow-y-auto rounded-lg bg-muted/40 p-2.5">
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
                      )
                    ) : null}
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
