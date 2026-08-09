import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useKibo } from "@/lib/kibo/store";
import { GuideContent } from "./guide-content";

const titles = { zh: "使用指南", ja: "使い方ガイド", en: "How to use" } as const;

export function GuideSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { prefs } = useKibo();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{titles[prefs.uiLang] ?? titles.en}</SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100dvh-6rem)] px-4 pb-8">
          <GuideContent />
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
