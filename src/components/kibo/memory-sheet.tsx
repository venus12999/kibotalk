import { useKibo } from "@/lib/kibo/store";
import { MemoryPanel } from "./memory-panel";
import { OverlayFrame, type OverlayPresentation } from "./overlay-frame";
import { cn } from "@/lib/utils";

export function MemorySheet({
  open,
  onOpenChange,
  presentation = "dialog",
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presentation?: OverlayPresentation;
}) {
  const { t } = useKibo();
  return (
    <OverlayFrame
      open={open}
      onOpenChange={onOpenChange}
      presentation={presentation}
      title={t("navMemory")}
      contentClassName="sm:max-w-xl"
      bodyClassName={cn(
        "px-4 py-4",
        presentation === "dialog" ? "max-h-[min(70dvh,40rem)] overflow-y-auto" : undefined,
      )}
    >
      {open ? <MemoryPanel /> : null}
    </OverlayFrame>
  );
}
