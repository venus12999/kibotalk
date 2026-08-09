import * as React from "react";
import { ExternalLink, Copy, Check, MoreHorizontal } from "lucide-react";

/**
 * WeChat's in-app browser blocks getUserMedia, screen capture and OAuth popups,
 * and it ignores programmatic redirects to external browsers. The only reliable
 * path is an unavoidable overlay telling the user to tap "..." → open in browser.
 */
function isWeChat() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /micromessenger/.test(ua) && !/wxwork/.test(ua);
}

export function WechatOpenInBrowser() {
  const [show, setShow] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [url, setUrl] = React.useState("");

  React.useEffect(() => {
    if (isWeChat()) {
      setShow(true);
      setUrl(window.location.href);
      // Best-effort: some Android WeChat builds honour this scheme.
      if (/android/i.test(navigator.userAgent)) {
        const t = window.setTimeout(() => {
          window.location.href = `intent://${window.location.host}${window.location.pathname}${window.location.search}#Intent;scheme=https;action=android.intent.action.VIEW;end`;
        }, 400);
        return () => window.clearTimeout(t);
      }
    }
    return undefined;
  }, []);

  if (!show) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.createElement("textarea");
      el.value = url;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const isIOS = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 z-[9999] flex flex-col bg-neutral-900/95 p-5 text-white backdrop-blur-sm">
      <div className="flex justify-end">
        <div className="flex animate-bounce items-center gap-2 text-sm">
          <span>点这里</span>
          <MoreHorizontal className="size-6" />
        </div>
      </div>

      <div className="mt-10 flex flex-1 flex-col items-center justify-center text-center">
        <ExternalLink className="size-10 opacity-80" />
        <h1 className="mt-4 text-lg font-semibold">请在浏览器中打开</h1>
        <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">
          微信内置浏览器无法使用麦克风与实时语音功能。请点击右上角的
          <span className="mx-1 font-semibold text-white">「···」</span>
          按钮，选择
          <span className="mx-1 font-semibold text-white">
            {isIOS ? "「在 Safari 中打开」" : "「在浏览器打开」"}
          </span>
          继续使用 KiboTalk。
        </p>

        <button
          type="button"
          onClick={() => void copy()}
          className="mt-6 inline-flex items-center gap-2 rounded-full bg-white/15 px-5 py-2.5 text-sm font-medium active:scale-95"
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? "链接已复制" : "复制链接"}
        </button>
        <p className="mt-2 max-w-xs break-all text-[11px] text-white/40">{url}</p>
      </div>
    </div>
  );
}
