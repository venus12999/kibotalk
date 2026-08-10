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
  /** The exact line the reply must answer — the message just received. */
  latest?: string;
  conversationLang?: string;
  uiLang?: string;
  level?: string;
  /**
   * Some mobile browsers / in-app WebViews never surface a readable body for
   * an event-stream. Those clients ask for `stream: false` and get the whole
   * answer as one plain-text response instead.
   */
  stream?: boolean;
  /** Who the user is, from their profile fields. */
  profile?: string;
  /** Kibo Memory entries kept across sessions. */
  memory?: string[];
};


export const Route = createFileRoute("/api/suggest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env["DEEPSEEK_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 500 });

        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body || !Array.isArray(body.turns)) {
          return new Response("Invalid request body", { status: 400 });
        }

        const { getAiModels } = await import("@/lib/kibo/model-config.server");
        const { getCoachPrompt } = await import("@/lib/kibo/coach-prompt.server");
        const [aiModels, coachPrompt] = await Promise.all([getAiModels(), getCoachPrompt()]);

        const target = LANG_NAME[body.conversationLang ?? "en"] ?? "English";
        const ui = LANG_NAME[body.uiLang ?? "en"] ?? "English";
        const transcript = body.turns
          .slice(-12)
          .map((t) => `${t.speaker === "user" ? "ME" : "OTHER"}: ${t.text}`)
          .join("\n");
        const latest = (body.latest ?? "").trim() ||
          [...body.turns].reverse().find((t) => t.speaker === "other")?.text.trim() ||
          "";

        // Emotion-intelligence read of the moment: dictionary match on the
        // newest line plus the user's own last line, so replies serve the
        // real communication need instead of just answering the words.
        let briefing = "";
        try {
          const { loadEmotionLibrary, matchEmotions, emotionBriefing } = await import(
            "@/lib/kibo/emotion.server"
          );
          const rows = await loadEmotionLibrary();
          const myLast = [...body.turns].reverse().find((t) => t.speaker === "user")?.text ?? "";
          const matches = matchEmotions(`${latest}\n${myLast}`, rows, 3);
          briefing = emotionBriefing(matches);
        } catch {
          /* emotion library is an enhancement; never block a suggestion */
        }


        // Kibo Memory: stable facts about the user that must survive sessions.
        const profile = (body.profile ?? "").trim().slice(0, 600);
        const memory = (Array.isArray(body.memory) ? body.memory : [])
          .map((m) => String(m).trim())
          .filter(Boolean)
          .slice(0, 12);
        const memoryBlock = [
          profile ? `About the user: ${profile}` : "",
          memory.length > 0
            ? `Remembered facts about the user (use them when relevant, never contradict them, never read them out loud): ${memory.join(" | ")}`
            : "",
        ]
          .filter(Boolean)
          .join(" ");

        const wantsStream = body.stream !== false;

        const upstream = await fetch("https://api.deepseek.com/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: aiModels.suggest,
            stream: wantsStream,

            // DeepSeek v4 flash reasons before answering by default, which
            // delays the first visible token — the coach must be instant.
            thinking: { type: "disabled" },
            temperature: 0.7,
            max_tokens: 1200,
            messages: [
              {
                role: "system",
                content: [
                  `You are a real-time conversation coach. The user is speaking ${target} with another person.`,
                  `The transcript is ordered oldest to newest; the LAST "OTHER" line is the message that was just received.`,
                  latest
                    ? `Reply directly to this newest line from the other person: "${latest}". Earlier turns are background context only — never answer an older line.`
                    : ``,
                  memoryBlock,
                  briefing,
                  coachPrompt,
                  `Propose exactly 3 short, distinct, natural replies the user could say next, in ${target}.`,


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
              {
                role: "user",
                content: transcript
                  ? `${transcript}\n\n[Reply to the newest OTHER line: ${latest || "(none)"}]`
                  : "(the conversation just started)",
              },
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

        // Non-streaming clients get the finished answer in one plain-text body.
        if (!wantsStream) {
          const json = (await upstream.json().catch(() => null)) as {
            choices?: { message?: { content?: string } }[];
          } | null;
          const content = json?.choices?.[0]?.message?.content ?? "";
          return new Response(content, {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }

        // Re-emit only the text deltas as SSE so the client can render token by token.
        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();

        const encoder = new TextEncoder();
        let buffer = "";

        const stream = new ReadableStream({
          async pull(controller) {
            let done: boolean;
            let value: Uint8Array | undefined;
            try {
              ({ done, value } = await reader.read());
            } catch {
              // Upstream dropped mid-answer: end the SSE cleanly so the client
              // keeps whatever it already rendered instead of seeing a failure.
              controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
              controller.close();
              return;
            }
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
            "X-Accel-Buffering": "no",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
