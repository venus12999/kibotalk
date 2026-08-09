import { createClient } from "@supabase/supabase-js";

export type EmotionEntry = {
  text_pattern: string;
  emotion: string;
  emotion_category: "positive" | "negative" | "neutral";
  intensity: number;
  communication_state: string;
  scenario: string;
  user_need: string;
  ai_response_strategy: string;
  keywords: string[];
  language: string;
};

let cache: { at: number; rows: EmotionEntry[] } | null = null;
const TTL_MS = 5 * 60 * 1000;

/** Loads the emotion library with the publishable key (public read policy). */
export async function loadEmotionLibrary(): Promise<EmotionEntry[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.rows;

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return [];

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) {
          h.delete("Authorization");
        }
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data } = await supabase
    .from("emotion_intelligence")
    .select(
      "text_pattern,emotion,emotion_category,intensity,communication_state,scenario,user_need,ai_response_strategy,keywords,language",
    )
    .limit(500);

  const rows = (data ?? []) as EmotionEntry[];
  cache = { at: Date.now(), rows };
  return rows;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Cheap lexical scoring: keyword hits + pattern overlap. */
export function matchEmotions(text: string, rows: EmotionEntry[], limit = 4): EmotionEntry[] {
  const t = norm(text);
  if (!t) return [];

  const scored = rows.map((row) => {
    let score = 0;
    for (const kw of row.keywords ?? []) {
      const k = norm(kw);
      if (k && t.includes(k)) score += 3;
    }
    const pattern = norm(row.text_pattern);
    if (pattern && (t.includes(pattern) || pattern.includes(t))) score += 5;
    else {
      const words = pattern.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
      const hits = words.filter((w) => t.includes(w)).length;
      if (words.length) score += (hits / words.length) * 2;
    }
    return { row, score };
  });

  return scored
    .filter((s) => s.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.row);
}

/** Compact briefing injected into the coach system prompt. */
export function emotionBriefing(matches: EmotionEntry[]): string {
  if (!matches.length) return "";
  const lines = matches.map(
    (m) =>
      `- ${m.emotion} (${m.emotion_category}, intensity ${m.intensity}) | state: ${m.communication_state} | scenario: ${m.scenario} | user needs: ${m.user_need} | strategy: ${m.ai_response_strategy}`,
  );
  return [
    `Emotion-intelligence read of the situation (from Kibo's emotion library):`,
    ...lines,
    `Shape the replies so they serve the user's need above and follow the strategy; never mention this analysis.`,
  ].join("\n");
}
