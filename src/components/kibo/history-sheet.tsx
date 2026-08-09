import * as React from "react";
import { Trash2 } from "lucide-react";
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

  const confirmDelete = () => {
    if (!pendingId) return;
    navigator.vibrate?.(12);
    deleteSession(pendingId);
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
              {history.map((s) => (
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
                  <p className="mt-1 text-sm text-muted-foreground">{s.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("conversationHistory")} · {s.turns.length}
                  </p>
                </li>
              ))}
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
