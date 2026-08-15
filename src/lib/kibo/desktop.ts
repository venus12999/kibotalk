export const DESKTOP_GITHUB_REPO = "venus12999/kibotalk";
export const DESKTOP_RELEASES_URL = `https://github.com/${DESKTOP_GITHUB_REPO}/releases`;
export const DESKTOP_LATEST_RELEASE_API = `https://api.github.com/repos/${DESKTOP_GITHUB_REPO}/releases/latest`;
export const DESKTOP_UA_MARK = "KiboTalkDesktop/";

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

export type DesktopReleaseLinks = {
  ready: boolean;
  tag: string;
  macArm: string;
  macIntel: string;
  windows: string;
};

const emptyRelease = (): DesktopReleaseLinks => ({
  ready: false,
  tag: "",
  macArm: "",
  macIntel: "",
  windows: "",
});

type GithubAsset = { name: string; browser_download_url: string };

function pickAsset(assets: GithubAsset[], pattern: RegExp) {
  return assets.find((asset) => pattern.test(asset.name))?.browser_download_url ?? "";
}

export async function fetchLatestDesktopRelease(): Promise<DesktopReleaseLinks> {
  const next = emptyRelease();
  next.ready = true;
  try {
    const response = await fetch(DESKTOP_LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return next;
    const payload = (await response.json()) as {
      tag_name?: string;
      assets?: GithubAsset[];
    };
    const assets = payload.assets ?? [];
    next.tag = payload.tag_name ?? "";
    next.macArm = pickAsset(assets, /mac-arm64\.dmg$/i);
    next.macIntel = pickAsset(assets, /mac-x64\.dmg$/i);
    next.windows = pickAsset(assets, /win-x64\.exe$/i);
    return next;
  } catch {
    return next;
  }
}
