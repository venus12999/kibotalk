import { createFileRoute } from "@tanstack/react-router";

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

type Body = {
  turns?: { speaker: "user" | "other"; text: string }[];
  conversationLang?: string;
  uiLang?: string;
  level?: string;
};

export const Route = createFileRoute("/api/suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body || !Array.isArray(body.turns)) {
          return new Response("Invalid request body", { status: 400 });
        }

        const { getAiModels } = await import("@/lib/kibo/model-config.server");
        const aiModels = await getAiModels();

        const target = LANG_NAME[body.conversationLang ?? "en"] ?? "English";
        const ui = LANG_NAME[body.uiLang ?? "en"] ?? "English";
        const transcript = body.turns
          .slice(-12)
          .map((t) => `${t.speaker === "user" ? "ME" : "OTHER"}: ${t.text}`)
          .join("\n");

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
            "X-Lovable-AIG-SDK": "fetch",
          },
          body: JSON.stringify({
            model: aiModels.suggest,
            stream: true,
            temperature: 0.7,
            max_tokens: 1200,
            messages: [
              {
                role: "system",
                content: [
                  `You are a real-time conversation coach. The user is speaking ${target} with another person.`,
                  `Given the transcript, propose exactly 3 short, distinct, natural replies the user could say next, in ${target}.`,
                  LEVEL_HINT[body.level ?? "beginner"] ?? "",
                  `Output EXACTLY 3 lines. Each line is one compact JSON object and nothing else — no markdown fence, no numbering, no blank lines.`,
                  `Shape: {"targetText":"<the reply in ${target}>","meaning":"<one-line explanation in ${ui}>","segments":[{"t":"<surface>","r":"<reading>","role":"content|particle|punct"}]}`,
                  `segments must tile targetText exactly in order when the "t" values are concatenated.`,
                  target === "Japanese"
                    ? `"r" is hiragana furigana for kanji spans; use "" when the span is already kana or punctuation.`
                    : target === "Simplified Chinese"
                      ? `"r" is the pinyin with tone marks for each span; use "" for punctuation.`
                      : `"r" is "" for every span in English.`,
                ].join(" "),
              },
              { role: "user", content: transcript || "(the conversation just started)" },
            ],

          }),
        });

        if (upstream.status === 429) return new Response("rate_limited", { status: 429 });
        if (upstream.status === 402) return new Response("credits_exhausted", { status: 402 });
        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => "");
          return new Response(detail.slice(0, 300) || "AI request failed", {
            status: upstream.status || 502,
          });
        }

        // Re-emit only the text deltas as SSE so the client can render token by token.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer = "";

        const stream = new ReadableStream({
          async pull(controller) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
              controller.close();
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";
            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data:")) continue;
              const payload = trimmed.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const json = JSON.parse(payload) as {
                  choices?: { delta?: { content?: string } }[];
                };
                const delta = json.choices?.[0]?.delta?.content;
                if (delta) {
                  controller.enqueue(
                    encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
                  );
                }
              } catch {
                /* ignore partial frames */
              }
            }
          },
          cancel(reason) {
            return reader.cancel(reason);
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
