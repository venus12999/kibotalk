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
      hapticPressEnd();
      setReleaseKey((k) => k + 1);
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
        pointerRef.current = e.pointerId;
        e.currentTarget.setPointerCapture(e.pointerId);
        hapticPressStart();
        setPressKey((k) => k + 1);
        onBegin();
      }}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={() => release()}
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

