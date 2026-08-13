import { ScrollArea } from "@/components/ui/scroll-area";
import { useKibo } from "@/lib/kibo/store";
import { GuideContent } from "./guide-content";
import { OverlayFrame, type OverlayPresentation } from "./overlay-frame";
import { cn } from "@/lib/utils";

const titles = { zh: "使用指南", ja: "使い方ガイド", en: "How to use" } as const;

export function GuideSheet({
  open,
  onOpenChange,
  presentation = "sheet",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presentation?: OverlayPresentation;
}) {
  const { prefs } = useKibo();
  return (
    <OverlayFrame
      open={open}
      onOpenChange={onOpenChange}
      presentation={presentation}
      title={titles[prefs.uiLang] ?? titles.en}
    >
      <ScrollArea
        className={cn(
          "px-4 pb-8",
          presentation === "dialog" ? "h-[min(70dvh,40rem)]" : "h-[calc(100dvh-6rem)]",
        )}
      >
        <GuideContent />
      </ScrollArea>
    </OverlayFrame>
  );
}
