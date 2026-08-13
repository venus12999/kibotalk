import { createFileRoute } from "@tanstack/react-router";
import { deepseekBody } from "@/lib/kibo/ai-core.server";
import { angleFor, classifyLine } from "@/lib/kibo/classify-line";

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
        const { requireApiUser } = await import("@/lib/kibo/api-auth");
        const auth = await requireApiUser(request);
        if (auth instanceof Response) return auth;

        const apiKey = process.env["DEEPSEEK_API_KEY"];
        if (!apiKey) return new Response("AI is not configured", { status: 503 });

        const body = (await request.json().catch(() => null)) as Body | null;
        if (!body || !Array.isArray(body.turns)) {
          return new Response("Invalid request body", { status: 400 });
        }

        const { getAiModels } = await import("@/lib/kibo/model-config.server");
        const { getCoachPrompt } = await import("@/lib/kibo/coach-prompt.server");
        // Warm models + coach prompt in parallel; never wait on emotion for TTFT.
        const [aiModels, coachPrompt] = await Promise.all([getAiModels(), getCoachPrompt()]);

        const convLang = body.conversationLang ?? "en";
        const target = LANG_NAME[convLang] ?? "English";
        const ui = LANG_NAME[body.uiLang ?? "en"] ?? "English";
        // Furigana is only meaningful for Japanese; English and Chinese never
        // get readings, which also keeps their answers shorter and faster.
        const wantsRuby = convLang === "ja";
        const transcript = body.turns
          .slice(-8)
          .map((t) => `${t.speaker === "user" ? "ME" : "OTHER"}: ${t.text}`)
          .join("\n");
        const latest =
          (body.latest ?? "").trim() ||
          [...body.turns]
            .reverse()
            .find((t) => t.speaker === "other")
            ?.text.trim() ||
          "";

        // Local step (not LLM): decide closed / open / statement so Flash only
        // writes the reply text — no silent planning, no thinking mode.
        const kind = classifyLine(latest);

        // Emotion: only use a warm in-memory cache. Never wait on Supabase here.
        let briefing = "";
        try {
          const { peekEmotionLibrary, loadEmotionLibrary, matchEmotions, emotionBriefing } =
            await import("@/lib/kibo/emotion.server");
          const rows = peekEmotionLibrary();
          if (rows) {
            const myLast = [...body.turns].reverse().find((t) => t.speaker === "user")?.text ?? "";
            briefing = emotionBriefing(matchEmotions(`${latest}\n${myLast}`, rows, 2));
          } else {
            void loadEmotionLibrary(); // warm for the next turn
          }
        } catch {
          /* emotion library is an enhancement; never block a suggestion */
        }

        const profile = (body.profile ?? "").trim().slice(0, 400);
        const memory = (Array.isArray(body.memory) ? body.memory : [])
          .map((m) => String(m).trim())
          .filter(Boolean)
          .slice(0, 8);
        const memoryBlock = [
          profile ? `About user: ${profile}` : "",
          memory.length > 0 ? `Facts: ${memory.join(" | ")}` : "",
        ]
          .filter(Boolean)
          .join(" ");

        const shape = wantsRuby
          ? `JSON only: {"targetText":"<reply in ${target}>","meaning":"<one short line in ${ui}>","segments":[{"t":"<chunk>","r":"<hiragana only if chunk has kanji>"}]}. segments.t joined = targetText.`
          : `JSON only: {"targetText":"<reply in ${target}>","meaning":"<one short line in ${ui}>"}.`;

        const system = (slot: 0 | 1 | 2) =>
          [
            `Real-time coach. User speaks ${target}. Reply to the newest OTHER line only.`,
            latest ? `Newest line (${kind}): "${latest}"` : "",
            memoryBlock,
            briefing,
            // Keep admin rubric, but it is guidance — not a chain-of-thought ask.
            coachPrompt,
            `One short natural reply in ${target}. Angle: ${angleFor(kind, slot)}`,
            `This slot must differ from the other two suggestions.`,
            LEVEL_HINT[body.level ?? "beginner"] ?? "",
            shape,
            `targetText ≤30 chars (≤60 only for a 2-3 point list). meaning ≤20 chars. No markdown.`,
          ]
            .filter(Boolean)
            .join(" ");

        const userContent = transcript
          ? `${transcript}\n\n[Reply to newest OTHER: ${latest || "(none)"}]`
          : "(conversation just started)";

        const wantsStream = body.stream !== false;

        const call = (slot: 0 | 1 | 2) =>
          fetch("https://api.deepseek.com/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify(
              deepseekBody({
                model: aiModels.suggest,
                stream: wantsStream,
                temperature: 0.7,
                max_tokens: wantsRuby ? 220 : 120,
                messages: [
                  { role: "system", content: system(slot) },
                  { role: "user", content: userContent },
                ],
              }),
            ),
          });

        // Three independent generations start at the same moment.
        const settled = await Promise.allSettled(
          ([0, 1, 2] as const).map((slot) => call(slot)),
        );
        const responses = settled.map((s) => (s.status === "fulfilled" ? s.value : null));
        const ok = responses.filter((r): r is Response => !!r && r.ok);

        if (ok.length === 0) {
          const first = responses.find((r) => r !== null);
          if (first?.status === 429) return new Response("rate_limited", { status: 429 });
          if (first?.status === 402) return new Response("credits_exhausted", { status: 402 });
          const detail = first ? await first.text().catch(() => "") : "";
          return new Response(detail.slice(0, 300) || "AI request failed", {
            status: first?.status || 502,
          });
        }

        if (!wantsStream) {
          const parts = await Promise.all(
            responses.map(async (r) => {
              if (!r || !r.ok) return "";
              const json = (await r.json().catch(() => null)) as {
                choices?: { message?: { content?: string } }[];
              } | null;
              return json?.choices?.[0]?.message?.content ?? "";
            }),
          );
          return new Response(parts.filter(Boolean).join("\n"), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Cache-Control": "no-store",
            },
          });
        }

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(": open\n\n"));

            const pump = async (res: Response | null, index: number) => {
              if (!res || !res.ok || !res.body) return;
              const reader = res.body.getReader();
              const decoder = new TextDecoder();
              let buffer = "";
              try {
                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;
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
                        choices?: {
                          delta?: { content?: string; reasoning_content?: string };
                        }[];
                      };
                      // Only forward answer tokens — never stream CoT.
                      const delta = json.choices?.[0]?.delta?.content;
                      if (delta) {
                        controller.enqueue(
                          encoder.encode(`data: ${JSON.stringify({ i: index, delta })}\n\n`),
                        );
                      }
                    } catch {
                      /* ignore partial frames */
                    }
                  }
                }
              } catch {
                /* one slot dropping must not kill the other two */
              } finally {
                try {
                  await reader.cancel();
                } catch {
                  /* already closed */
                }
              }
            };

            void Promise.all(responses.map((r, i) => pump(r, i))).finally(() => {
              try {
                controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
                controller.close();
              } catch {
                /* client already went away */
              }
            });
          },
          cancel() {
            for (const r of responses) void r?.body?.cancel().catch(() => {});
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
