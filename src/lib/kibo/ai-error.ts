/**
 * Failure taxonomy for the suggestion stream.
 *
 * The user cannot act on "HTTP 503" — they can act on "the service is busy,
 * wait a moment and retry". Every failure is mapped to one of a few kinds and
 * each kind carries a localized title plus a concrete piece of advice.
 */

export type AiErrorKind =
  | "offline"
  | "network"
  | "timeout"
  | "rateLimit"
  | "credits"
  | "auth"
  | "server"
  | "invalid"
  | "empty"
  | "unknown";

/** Error carrying the HTTP status (or a pre-classified kind) from the stream. */
export class SuggestError extends Error {
  status?: number | undefined;
  kind?: AiErrorKind | undefined;
  constructor(message: string, opts?: { status?: number; kind?: AiErrorKind }) {
    super(message);
    this.name = "SuggestError";
    this.status = opts?.status;
    this.kind = opts?.kind;
  }
}

export function classifyAiError(err: unknown): AiErrorKind {
  if (err instanceof SuggestError) {
    if (err.kind) return err.kind;
    const s = err.status ?? 0;
    if (s === 401 || s === 403) return "auth";
    if (s === 402) return "credits";
    if (s === 408 || s === 504) return "timeout";
    if (s === 429) return "rateLimit";
    if (s === 503 && /not configured/i.test(err.message)) return "invalid";
    if (s >= 500) return "server";
    if (s >= 400) return "invalid";
    if (s === 0) return "network";
  }
  const message = err instanceof Error ? err.message : String(err ?? "");
  const text = message.toLowerCase();
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  if (text.includes("timeout") || text.includes("timed out")) return "timeout";
  if (text.includes("429") || text.includes("rate limit")) return "rateLimit";
  if (text.includes("402") || text.includes("credit")) return "credits";
  if (text.includes("not configured")) return "invalid";
  if (err instanceof TypeError || text.includes("failed to fetch") || text.includes("network"))
    return "network";
  if (/\b5\d\d\b/.test(text)) return "server";
  return "unknown";
}

type Copy = { title: string; advice: string };

const dict: Record<"zh" | "en" | "ja", Record<AiErrorKind, Copy>> = {
  zh: {
    offline: { title: "网络已断开", advice: "设备当前离线，请恢复 Wi‑Fi 或移动数据后点击重试。" },
    network: {
      title: "网络中断",
      advice: "连接在传输途中断开，多见于弱信号或切换网络时。稍等几秒后重试。",
    },
    timeout: {
      title: "响应超时",
      advice: "模型长时间没有返回内容。请重试；若反复超时，可缩短这一轮的对话内容。",
    },
    rateLimit: { title: "请求过于频繁", advice: "触发了限流，请等待约 30 秒后再重试。" },
    credits: { title: "额度不足", advice: "AI 额度已用完，需要补充额度后才能继续生成。" },
    auth: { title: "登录状态失效", advice: "身份验证失败，请重新登录后再试。" },
    server: { title: "服务异常", advice: "模型服务暂时不可用，通常几分钟内恢复，请稍后重试。" },
    invalid: { title: "请求无效", advice: "本轮内容无法处理，请重新说一句或换个表述再试。" },
    empty: { title: "没有生成内容", advice: "模型返回了空结果，直接点击重试通常即可解决。" },
    unknown: { title: "生成失败", advice: "出现未知问题，请重试；若持续失败请重新开始会话。" },
  },
  en: {
    offline: { title: "You're offline", advice: "Reconnect to Wi‑Fi or mobile data, then retry." },
    network: {
      title: "Connection dropped",
      advice: "The stream was cut mid-transfer — common on weak signal. Retry in a few seconds.",
    },
    timeout: {
      title: "Timed out",
      advice: "The model stopped sending data. Retry, and shorten the turn if it keeps happening.",
    },
    rateLimit: { title: "Too many requests", advice: "Rate limited — wait ~30s and retry." },
    credits: { title: "Out of credits", advice: "AI credits are exhausted. Top up to continue." },
    auth: { title: "Session expired", advice: "Authentication failed — sign in again." },
    server: { title: "Service error", advice: "The model service is down briefly. Retry shortly." },
    invalid: { title: "Invalid request", advice: "This turn couldn't be processed — rephrase it." },
    empty: { title: "Empty answer", advice: "The model returned nothing. Retrying usually works." },
    unknown: {
      title: "Generation failed",
      advice: "Unknown issue — retry, or restart the session.",
    },
  },
  ja: {
    offline: { title: "オフラインです", advice: "Wi‑Fi かモバイル通信に接続してから再試行を。" },
    network: {
      title: "接続が切断",
      advice: "転送中に接続が切れました。電波状況を確認し、数秒後に再試行してください。",
    },
    timeout: {
      title: "応答タイムアウト",
      advice: "応答が届きませんでした。再試行し、続く場合は発話を短くしてください。",
    },
    rateLimit: { title: "リクエスト過多", advice: "制限中です。30 秒ほど待って再試行を。" },
    credits: { title: "クレジット不足", advice: "AI クレジットが尽きました。追加が必要です。" },
    auth: { title: "認証切れ", advice: "認証に失敗しました。再度ログインしてください。" },
    server: { title: "サービス異常", advice: "モデル側が一時的に不調です。少し後に再試行を。" },
    invalid: { title: "リクエスト不正", advice: "この内容は処理できません。言い換えて再試行を。" },
    empty: { title: "生成結果が空", advice: "空の応答でした。再試行すれば通常は解決します。" },
    unknown: { title: "生成に失敗", advice: "不明なエラーです。再試行するか会話を開始し直して。" },
  },
};

export function describeAiError(kind: AiErrorKind, lang: string): Copy {
  const table = dict[(lang as "zh" | "en" | "ja") in dict ? (lang as "zh" | "en" | "ja") : "en"];
  return table[kind];
}
