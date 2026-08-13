import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type OverlayPresentation = "sheet" | "dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** sheet = side drawer (mobile default); dialog = centered modal. */
  presentation?: OverlayPresentation;
  /** Extra classes on the panel body wrapper. */
  bodyClassName?: string;
  /** Extra classes on SheetContent / DialogContent. */
  contentClassName?: string;
  headerExtra?: React.ReactNode;
};

/**
 * Shared chrome for history / memory / guide / settings so desktop and mobile
 * can pick dialog vs side sheet without duplicating panel guts.
 */
export function OverlayFrame({
  open,
  onOpenChange,
  title,
  children,
  presentation = "sheet",
  bodyClassName,
  contentClassName,
  headerExtra,
}: Props) {
  if (presentation === "dialog") {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className={cn(
            "flex max-h-[min(88dvh,52rem)] w-[min(100vw-1.5rem,36rem)] flex-col gap-0 overflow-hidden border-[var(--glass-border)] bg-[var(--glass-strong)] p-0 shadow-[var(--glass-shadow)] backdrop-blur-xl sm:rounded-xl",
            contentClassName,
          )}
        >
          <DialogHeader className="shrink-0 space-y-0 border-b border-[oklch(35%_0.02_80_/_0.06)] px-5 pt-5 pr-14 pb-3 text-left">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="font-display text-lg font-semibold tracking-tight">
                {title}
              </DialogTitle>
              {headerExtra}
            </div>
          </DialogHeader>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("w-full p-0 sm:max-w-lg", contentClassName)}
      >
        <SheetHeader className="border-b border-[oklch(35%_0.02_80_/_0.06)] px-5 pt-5 pr-14 pb-3">
          <div className="flex items-center justify-between gap-2 pr-2">
            <SheetTitle className="font-display text-lg font-semibold tracking-tight">
              {title}
            </SheetTitle>
            {headerExtra}
          </div>
        </SheetHeader>
        <div className={cn(bodyClassName)}>{children}</div>
      </SheetContent>
    </Sheet>
  );
}
