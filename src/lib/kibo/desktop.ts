export const DESKTOP_GITHUB_REPO = "venus12999/kibotalk";
export const DESKTOP_RELEASE_TAG = "desktop-v0.1.0";
export const DESKTOP_RELEASES_URL = `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest`;
export const DESKTOP_UA_MARK = "KiboTalkDesktop/";

export const DESKTOP_FILES = {
  macArm: "KiboTalk-mac-arm64.dmg",
  macIntel: "KiboTalk-mac-x64.dmg",
  windows: "KiboTalk-win-x64.exe",
} as const;

/** Same-origin paths so the browser downloads a file instead of opening GitHub. */
export const DESKTOP_DOWNLOADS = {
  macArm: `/api/desktop/${DESKTOP_FILES.macArm}`,
  macIntel: `/api/desktop/${DESKTOP_FILES.macIntel}`,
  windows: `/api/desktop/${DESKTOP_FILES.windows}`,
} as const;

export function githubDesktopAssetUrl(filename: string) {
  return `https://github.com/${DESKTOP_GITHUB_REPO}/releases/download/${DESKTOP_RELEASE_TAG}/${filename}`;
}

export type DesktopPlatform = "mac-arm" | "mac-intel" | "windows" | "other";

export function isKiboTalkDesktop() {
  if (typeof navigator === "undefined") return false;
  if (navigator.userAgent.includes(DESKTOP_UA_MARK)) return true;
  return Boolean(
    (window as Window & { kibotalkDesktop?: { isDesktop?: boolean } }).kibotalkDesktop?.isDesktop,
  );
}

export function detectDesktopPlatform(): DesktopPlatform {
  if (typeof navigator === "undefined") return "other";
  const ua = navigator.userAgent;
  const platform = navigator.platform || "";
  // iPhone UA also contains "Mac OS X" — check phones before Mac.
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return "other";
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return "mac-arm";
  return "other";
}
