import { createServerFn } from "@tanstack/react-start";

const GATEWAY = "https://api.deepseek.com/chat/completions";
// Fastest / cheapest model in the catalog — suggestions must land while the
// other person is still talking.


const LANG_NAME: Record<string, string> = {
  ja: "Japanese",
  en: "English",
  zh: "Simplified Chinese",
};

const LEVEL_HINT: Record<string, string> = {
  beginner: "Use short, simple, very common sentences.",
  intermediate: "Use natural everyday sentences of moderate length.",
  advanced: "Use fluent, nuanced, idiomatic sentences.",
};

type Turn = { speaker: "user" | "other"; text: string };

export type SuggestInput = {
  turns: Turn[];
  conversationLang: string;
  uiLang: string;
  level: string;
};

async function gateway(body: unknown) {
  const key = process.env["DEEPSEEK_API_KEY"];
  if (!key) throw new Error("Missing DEEPSEEK_API_KEY");
  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new Error("rate_limited");
  if (res.status === 402) throw new Error("credits_exhausted");
  if (!res.ok) throw new Error(`ai_error_${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  return json.choices?.[0]?.message?.content ?? "";
}

export const suggestReplies = createServerFn({ method: "POST" })
  .inputValidator((input: SuggestInput) => input)
  .handler(async ({ data }) => {
    const target = LANG_NAME[data.conversationLang] ?? "English";
    const ui = LANG_NAME[data.uiLang] ?? "English";
    const transcript = data.turns
      .slice(-12)
      .map((t) => `${t.speaker === "user" ? "ME" : "OTHER"}: ${t.text}`)
      .join("\n");

    const { getAiModels } = await import("./model-config.server");
    const content = await gateway({
      model: (await getAiModels()).suggest,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: [
            `You are a real-time conversation coach. The user is speaking ${target} with another person.`,
            `Given the transcript, propose 3 short, distinct, natural replies the user could say next, in ${target}.`,
            LEVEL_HINT[data.level] ?? "",
            `Also give a one-line "angle" for each: what that reply achieves, written in ${ui}.`,
            `Reply ONLY with JSON: {"candidates":[{"text":"...","meaning":"..."}]}`,
          ].join(" "),
        },
        { role: "user", content: transcript || "(the conversation just started)" },
      ],
      response_format: { type: "json_object" },
      max_tokens: 500,
      temperature: 0.7,
    });

    try {
      const parsed = JSON.parse(content) as {
        candidates?: { text?: string; meaning?: string }[];
      };
      const candidates = (parsed.candidates ?? [])
        .filter((c) => typeof c.text === "string" && c.text.trim())
        .slice(0, 3)
        .map((c) => ({ text: String(c.text), meaning: String(c.meaning ?? "") }));
      return { candidates };
    } catch {
      return { candidates: [] };
    }
  });

export type SummaryInput = {
  turns: Turn[];
  conversationLang: string;
  uiLang: string;
  level: string;
};

export const summarizeSession = createServerFn({ method: "POST" })
  .inputValidator((input: SummaryInput) => input)
  .handler(async ({ data }) => {
    const target = LANG_NAME[data.conversationLang] ?? "English";
    const ui = LANG_NAME[data.uiLang] ?? "English";
    const transcript = data.turns
      .map((t) => `${t.speaker === "user" ? "ME" : "OTHER"}: ${t.text}`)
      .join("\n");

    const { getAiModels } = await import("./model-config.server");
    const summary = await gateway({
      model: (await getAiModels()).summary,
      messages: [
        {
          role: "system",
          content: `Summarise this ${target} practice conversation in 2-3 sentences, written in ${ui}. Mention what was discussed and one concrete tip to sound more natural. Plain text only.`,
        },
        { role: "user", content: transcript },
      ],
      max_tokens: 300,
    });

    return { summary: summary.trim() };
  });

export type TranslateInput = { text: string; from: string; to: string };

/** Translate one transcript line into the user's chosen translation language. */
export const translateLine = createServerFn({ method: "POST" })
  .inputValidator((input: TranslateInput) => input)
  .handler(async ({ data }) => {
    const text = data.text.trim().slice(0, 800);
    if (!text || data.from === data.to) return { translation: "" };
    const to = LANG_NAME[data.to] ?? "English";
    const from = LANG_NAME[data.from] ?? "English";

    const { getAiModels } = await import("./model-config.server");
    const translation = await gateway({
      model: (await getAiModels()).suggest,
      thinking: { type: "disabled" },
      messages: [
        {
          role: "system",
          content: `Translate the ${from} sentence into natural ${to}. Reply with the translation only — no quotes, no notes, no romanization.`,
        },
        { role: "user", content: text },
      ],
      max_tokens: 300,
      temperature: 0.2,
    });

    return { translation: translation.trim() };
  });
