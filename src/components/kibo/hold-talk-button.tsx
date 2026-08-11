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
  /** Desktop shortcut: hold this letter key to talk (e.g. "a"). */
  hotkey?: string;
  onBegin: () => void;
  onEnd: () => void;
};

/** Typing in a field or dialog must never trigger the talk shortcut. */
function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable ||
    Boolean(target.closest("[role='dialog'],[contenteditable='true']"))
  );
}


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
  hotkey,

  onBegin,
  onEnd,
}: Props) {
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const pointerRef = React.useRef<number | null>(null);
  const inputRef = React.useRef<"pointer" | "touch" | null>(null);
  const [elapsed, setElapsed] = React.useState(0);
  // Bumping these keys restarts the one-shot press / release animations.
  const [pressKey, setPressKey] = React.useState(0);
  const [releaseKey, setReleaseKey] = React.useState(0);
  const onEndRef = React.useRef(onEnd);
  onEndRef.current = onEnd;
  const onBeginRef = React.useRef(onBegin);
  onBeginRef.current = onBegin;
  const inertRef = React.useRef(Boolean(disabled || blocked));
  inertRef.current = Boolean(disabled || blocked);

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
   *
   * Android Chrome has the mirror problem: right after the press it can emit a
   * spurious `touchcancel` (long-press gesture detection) or blur the window
   * (mic permission chip / vibration), which used to cancel the turn before the
   * user ever spoke. Those two signals are therefore ignored for a short grace
   * period after the press; a real finger lift always arrives as `touchend`.
   */
  const startedAtRef = React.useRef(0);
  const CANCEL_GRACE_MS = 1200;

  const release = React.useCallback((pointerId?: number, input?: "pointer" | "touch") => {
    if (pointerRef.current === null) return;
    if (input && inputRef.current !== input) return;
    if (pointerId !== undefined && pointerId !== pointerRef.current) return;
    pointerRef.current = null;
    inputRef.current = null;
    hapticPressEnd();
    setReleaseKey((k) => k + 1);
    onEndRef.current();
  }, []);

  const inert = disabled || blocked;

  const begin = React.useCallback((pointerId: number, input: "pointer" | "touch") => {
    if (pointerRef.current !== null) return;
    if (inertRef.current) {
      hapticReject();
      return;
    }
    pointerRef.current = pointerId;
    inputRef.current = input;
    startedAtRef.current = performance.now();
    hapticPressStart();
    setPressKey((k) => k + 1);
    onBeginRef.current();
  }, []);

  React.useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    // iOS may emit pointercancel as soon as React re-renders a held control.
    // Handle fingers with native, non-passive Touch Events instead and reserve
    // Pointer Events for mouse / pen input.
    const touchStart = (event: TouchEvent) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      if (touch) begin(touch.identifier, "touch");
    };
    const touchMove = (event: TouchEvent) => event.preventDefault();
    const touchEnd = (event: TouchEvent) => {
      for (const touch of Array.from(event.changedTouches)) {
        release(touch.identifier, "touch");
      }
    };
    const withinGrace = () => performance.now() - startedAtRef.current < CANCEL_GRACE_MS;
    const touchCancel = (event: TouchEvent) => {
      // Android fires this during its own long-press detection; ignore early ones.
      if (withinGrace()) return;
      touchEnd(event);
    };
    const contextMenu = (event: Event) => {
      if (pointerRef.current !== null) event.preventDefault();
    };
    const pointerUp = (event: PointerEvent) => release(event.pointerId, "pointer");
    const pointerCancel = (event: PointerEvent) => {
      if (withinGrace()) return;
      release(event.pointerId, "pointer");
    };
    const blur = () => {
      // A permission chip or the vibration API can blur the window right after
      // the press on Android; only a real backgrounding should end the turn.
      if (withinGrace()) return;
      release();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") release();
    };

    button.addEventListener("touchstart", touchStart, { passive: false });
    button.addEventListener("touchmove", touchMove, { passive: false });
    window.addEventListener("touchend", touchEnd, { passive: true });
    window.addEventListener("touchcancel", touchCancel, { passive: true });
    window.addEventListener("pointerup", pointerUp);
    window.addEventListener("pointercancel", pointerCancel);
    window.addEventListener("contextmenu", contextMenu);
    window.addEventListener("blur", blur);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      button.removeEventListener("touchstart", touchStart);
      button.removeEventListener("touchmove", touchMove);
      window.removeEventListener("touchend", touchEnd);
      window.removeEventListener("touchcancel", touchCancel);
      window.removeEventListener("pointerup", pointerUp);
      window.removeEventListener("pointercancel", pointerCancel);
      window.removeEventListener("contextmenu", contextMenu);
      window.removeEventListener("blur", blur);
      document.removeEventListener("visibilitychange", visibility);
      release();
    };
  }, [begin, release]);

  return (
    <button
      ref={buttonRef}
      type="button"
      aria-pressed={active}
      aria-label={label}
      disabled={disabled}
      style={{ WebkitTouchCallout: "none", WebkitUserSelect: "none", touchAction: "none" }}
      className={cn(
        "dock-scaled relative flex flex-1 select-none touch-none flex-col items-center justify-center gap-0.5 overflow-hidden rounded-2xl sm:h-16",
        "text-sm font-semibold transition-all duration-150 ease-out will-change-transform",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "gradient-primary text-primary-foreground scale-[0.96] glow-sm shadow-inner ring-2 ring-primary/50"
          : "glass-panel text-foreground hover:brightness-[1.03] active:scale-[0.98]",
        inert && !active && "pointer-events-none opacity-45",
      )}
      onPointerDown={(e) => {
        // Touch input is handled by native Touch Events above for iOS stability.
        if (e.pointerType === "touch") return;
        // Only the first primary pointer arms a turn; extra fingers are ignored.
        if (!e.isPrimary || pointerRef.current !== null) return;
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if (inert) {
          hapticReject();
          return;
        }
        e.preventDefault();
        begin(e.pointerId, "pointer");
      }}
      onKeyDown={(e) => {
        // Desktop keyboard: hold Space / Enter to talk (auto-repeat ignored).
        if (e.key !== " " && e.key !== "Enter") return;
        e.preventDefault();
        if (e.repeat || pointerRef.current !== null) return;
        if (inert) {
          hapticReject();
          return;
        }
        begin(-1, "pointer");
      }}
      onKeyUp={(e) => {
        if (e.key !== " " && e.key !== "Enter") return;
        e.preventDefault();
        release(-1, "pointer");
      }}
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
