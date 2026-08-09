/**
 * Server-only helpers shared by the AI server functions.
 *
 * These live outside `ai.functions.ts` on purpose: the server-fn Vite plugin
 * splits that module, and sibling declarations used inside a handler become
 * `ReferenceError`s at runtime.
 */

const GATEWAY = "https://api.deepseek.com/chat/completions";

export const LANG_NAME: Record<string, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Simplified Chinese",
};

export const LEVEL_HINT: Record<string, string> = {
  beginner: "Use short, simple, very common sentences.",
  intermediate: "Use natural everyday sentences of moderate length.",
  advanced: "Use fluent, nuanced, idiomatic sentences.",
};

export type Turn = { speaker: "user" | "other"; text: string };

/** One-shot DeepSeek chat call; returns the assistant text. */
export async function gateway(body: Record<string, unknown>) {
  const key = process.env["DEEPSEEK_API_KEY"];
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    // DeepSeek v4 reasons before answering by default; that both slows the
    // reply and eats the max_tokens budget, so keep it off unless overridden.
    body: JSON.stringify({ thinking: { type: "disabled" }, ...body }),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("credits_exhausted");
  if (!res.ok) throw new Error(`ai_error_${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}
