/** Light haptic tap for touch devices; silently no-ops where unsupported. */
export function hapticTap(pattern: number | number[] = 12) {
  if (typeof navigator === "undefined") return;
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  try {
    nav.vibrate?.(pattern);
  } catch {
    /* ignore */
  }
}

/** Firm double-thump when a push-to-talk turn starts. */
export function hapticPressStart() {
  hapticTap([18, 40, 26]);
}

/** Short confirming tap when the turn is released. */
export function hapticPressEnd() {
  hapticTap([10, 30, 10]);
}

/** Soft blocked/ignored feedback. */
export function hapticReject() {
  hapticTap([6, 60, 6]);
}
