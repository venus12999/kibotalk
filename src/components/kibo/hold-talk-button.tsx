import * as React from "react";
import { cn } from "@/lib/utils";
import { hapticTap } from "@/lib/haptics";

type Props = {
  active: boolean;
  /** Another button is held right now — this one must stay inert. */
  blocked?: boolean;
  disabled?: boolean;
  label: string;
  activeLabel: string;
  icon: React.ReactNode;
  /** 0..1 input level, drives the live meter while held. */
  level: number;
  onBegin: () => void;
  onEnd: () => void;
};

/**
 * Push-to-talk button tuned for touch: single-pointer only, no scrolling or
 * long-press menus while held, and a clear pressed / recording state.
 */
export function HoldTalkButton({
  active,
  blocked,
  disabled,
  label,
  activeLabel,
  icon,
  level,
  onBegin,
  onEnd,
}: Props) {
  const pointerRef = React.useRef<number | null>(null);
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(id);
  }, [active]);

  const release = React.useCallback(
    (event?: React.PointerEvent<HTMLButtonElement>) => {
      if (pointerRef.current === null) return;
      if (event && event.pointerId !== pointerRef.current) return;
      pointerRef.current = null;
      hapticTap(6);
      onEnd();
    },
    [onEnd],
  );

  const inert = disabled || blocked;

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      className={cn(
        "relative flex h-16 flex-1 select-none touch-none flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl",
        "text-sm font-semibold transition-transform duration-100 ease-out will-change-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "gradient-primary text-primary-foreground scale-[0.97] glow-sm"
          : "glass-panel text-foreground hover:brightness-[1.03] active:scale-[0.98]",
        inert && !active && "pointer-events-none opacity-45",
      )}
      onPointerDown={(e) => {
        // Only the first primary pointer arms a turn; extra fingers are ignored.
        if (inert || !e.isPrimary || pointerRef.current !== null) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        pointerRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        hapticTap(12);
        onBegin();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => release()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 origin-left bg-primary-foreground/70 transition-[transform] duration-75"
          style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, level))})` }}
        />
      ) : null}
      <span className="flex items-center gap-2">
        <span className={cn("flex size-4 items-center justify-center", active && "animate-pulse")}>
          {icon}
        </span>
        {active ? activeLabel : label}
      </span>
      {active ? (
        <span className="text-[11px] font-medium tabular-nums opacity-80">
          {elapsed.toFixed(1)}s
        </span>
      ) : null}
    </button>
  );
}
