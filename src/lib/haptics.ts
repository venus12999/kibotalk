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
