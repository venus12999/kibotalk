import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";

export function HistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { history, t, prefs } = useKibo();
  const ui = prefs.uiLang;
  const locale = ui === "zh" ? "zh-CN" : ui === "ja" ? "ja-JP" : "en";

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
                  <p className="text-xs font-semibold text-muted-foreground">
                    {new Intl.DateTimeFormat(locale, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(s.startedAt))}{" "}
                    · {langLabel(s.conversationLang, ui)} · {levelLabel(s.level, ui)}
                  </p>
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
    </Sheet>
  );
}
