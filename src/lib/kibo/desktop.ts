export const DESKTOP_GITHUB_REPO = "venus12999/kibotalk";
export const DESKTOP_RELEASES_URL = `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest`;
export const DESKTOP_UA_MARK = "KiboTalkDesktop/";

const latestDownload = (filename: string) =>
  `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest/download/${filename}`;

/** Direct links to the latest GitHub Release assets. Names must match electron-builder. */
export const DESKTOP_DOWNLOADS = {
  macArm: latestDownload("KiboTalk-mac-arm64.dmg"),
  macIntel: latestDownload("KiboTalk-mac-x64.dmg"),
  windows: latestDownload("KiboTalk-win-x64.exe"),
} as const;

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
  if (/Win/i.test(platform) || /Windows/i.test(ua)) return "windows";
  if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) return "mac-arm";
  return "other";
}
