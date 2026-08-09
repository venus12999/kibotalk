import * as React from "react";
import { cn } from "@/lib/utils";
import { hapticPressEnd, hapticPressStart, hapticReject } from "@/lib/haptics";

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
  // Bumping these keys restarts the one-shot press / release animations.
  const [pressKey, setPressKey] = React.useState(0);
  const [releaseKey, setReleaseKey] = React.useState(0);
  const onEndRef = React.useRef(onEnd);
  onEndRef.current = onEnd;

  React.useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const started = performance.now();
    const id = window.setInterval(() => setElapsed((performance.now() - started) / 1000), 100);
    return () => window.clearInterval(id);
  }, [active]);

  /**
   * Release is tracked on `window`, not via pointer capture: on iOS Safari a
   * re-render of the button (which happens the instant a turn starts) can drop
   * an implicit pointer capture and fire `lostpointercapture`, which used to
   * end the turn immediately — the "long press doesn't work on phones" bug.
   */
  const release = React.useCallback((pointerId?: number) => {
    if (pointerRef.current === null) return;
    if (pointerId !== undefined && pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    hapticPressEnd();
    setReleaseKey((k) => k + 1);
    onEndRef.current();
  }, []);

  React.useEffect(() => () => release(), [release]);

  const inert = disabled || blocked;

  const begin = (pointerId: number) => {
    pointerRef.current = pointerId;
    hapticPressStart();
    setPressKey((k) => k + 1);
    onBegin();

    const up = (e: PointerEvent) => release(e.pointerId);
    const cancel = (e: PointerEvent) => release(e.pointerId);
    const blur = () => release();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", blur);
    const cleanup = () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", blur);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  };

  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", touchAction: "none" }}
      className={cn(
        "relative flex h-20 flex-1 select-none touch-none flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl sm:h-16",
        "text-sm font-semibold transition-all duration-150 ease-out will-change-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "gradient-primary text-primary-foreground scale-[0.96] glow-sm shadow-inner ring-2 ring-primary/50"
          : "glass-panel text-foreground hover:brightness-[1.03] active:scale-[0.98]",
        inert && !active && "pointer-events-none opacity-45",
      )}
      onPointerDown={(e) => {
        // Only the first primary pointer arms a turn; extra fingers are ignored.
        if (!e.isPrimary || pointerRef.current !== null) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (inert) {
          hapticReject();
          return;
        }
        e.preventDefault();
        begin(e.pointerId);
      }}
      onTouchStart={(e) => e.preventDefault()}
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >

      {/* press ripple */}
      {pressKey > 0 ? (
        <span
          key={`press-${pressKey}`}
          aria-hidden
          className="ptt-ring pointer-events-none absolute inset-0 rounded-2xl border-2 border-primary/70"
        />
      ) : null}
      {/* release flash */}
      {releaseKey > 0 ? (
        <span
          key={`release-${releaseKey}`}
          aria-hidden
          className="ptt-flash pointer-events-none absolute inset-0 rounded-2xl bg-primary/40"
        />
      ) : null}
      {/* breathing halo while recording */}
      {active ? (
        <span
          aria-hidden
          className="ptt-halo pointer-events-none absolute inset-0 rounded-2xl bg-primary-foreground/10"
        />
      ) : null}
      {active ? (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1.5 origin-left bg-primary-foreground/80 transition-[transform] duration-75"
          style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, level))})` }}
        />
      ) : null}
      <span className="relative flex items-center gap-2">
        <span className={cn("flex size-4 items-center justify-center", active && "animate-pulse")}>
          {icon}
        </span>
        {active ? activeLabel : label}
      </span>
      {active ? (
        <span className="relative text-[11px] font-medium tabular-nums opacity-80">
          {elapsed.toFixed(1)}s
        </span>
      ) : null}
    </button>
  );
}

