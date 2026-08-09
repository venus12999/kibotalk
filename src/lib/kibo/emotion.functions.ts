import { createServerFn } from "@tanstack/react-start";

export type EmotionAnalysis = {
  emotion: string;
  emotion_category: "positive" | "negative" | "neutral";
  intensity: number;
  communication_state: string;
  scenario: string;
  user_need: string;
  recommended_action: string;
  matched_patterns: string[];
};

/**
 * analyzeEmotion(user_input)
 * Combines emotion-dictionary matching, context understanding and scenario
 * recognition, and always returns an actionable communication solution.
 */
export const analyzeEmotion = createServerFn({ method: "POST" })
  .inputValidator((input: { text: string; context?: string }) => ({
    text: String(input?.text ?? "").slice(0, 2000),
    context: String(input?.context ?? "").slice(0, 4000),
  }))
  .handler(async ({ data }): Promise<EmotionAnalysis> => {
    const { loadEmotionLibrary, matchEmotions } = await import("./emotion.server");
    const rows = await loadEmotionLibrary();
    const matches = matchEmotions(data.text, rows, 5);
    const top = matches[0];

    const fallback: EmotionAnalysis = {
      emotion: top?.emotion ?? "neutral",
      emotion_category: top?.emotion_category ?? "neutral",
      intensity: top?.intensity ?? 4,
      communication_state: top?.communication_state ?? "learning",
      scenario: top?.scenario ?? "small_talk",
      user_need: top?.user_need ?? "keep the conversation moving",
      recommended_action:
        top?.ai_response_strategy ?? "offer one short, natural reply the user can say right now",
      matched_patterns: matches.map((m) => m.text_pattern),
    };

    const apiKey = process.env["DEEPSEEK_API_KEY"];
    if (!apiKey || !data.text.trim()) return fallback;

    const { getAiModels } = await import("./model-config.server");
    const models = await getAiModels();

    const dictionary = matches
      .map(
        (m) =>
          `${m.emotion}/${m.emotion_category}/${m.intensity} | ${m.communication_state} | ${m.scenario} | need: ${m.user_need} | strategy: ${m.ai_response_strategy}`,
      )
      .join("\n");

    try {
      const res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: models.suggest,
          thinking: { type: "disabled" },
          temperature: 0.2,
          max_tokens: 400,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: [
                "You are Kibo's emotion-intelligence engine for real-world conversations.",
                "Decide what the speaker feels, why, which communication difficulty is happening, and what help Kibo should give.",
                "Never stop at classification: recommended_action must be a concrete communication solution.",
                'Return only JSON: {"emotion":"","emotion_category":"positive|negative|neutral","intensity":1-10,"communication_state":"confident|hesitant|blocked|overthinking|misunderstood|need_translation|need_rephrase|need_social_help|need_explanation|lack_of_confidence|motivated|low_motivation|social_pressure|learning","scenario":"","user_need":"","recommended_action":""}',
                dictionary ? `Dictionary candidates:\n${dictionary}` : "",
              ].join(" "),
            },
            {
              role: "user",
              content: data.context
                ? `Conversation context:\n${data.context}\n\nAnalyze this input: ${data.text}`
                : data.text,
            },
          ],
        }),
      });
      if (!res.ok) return fallback;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = json.choices?.[0]?.message?.content ?? "";
      const parsed = JSON.parse(raw) as Partial<EmotionAnalysis>;
      return {
        ...fallback,
        ...parsed,
        intensity: Math.min(10, Math.max(1, Number(parsed.intensity) || fallback.intensity)),
        matched_patterns: fallback.matched_patterns,
      };
    } catch {
      return fallback;
    }
  });
