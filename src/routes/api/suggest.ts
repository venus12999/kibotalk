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

/**
 * The three slots are generated in parallel, each with its own angle, so one
 * slow reply can never hold up the other two.
 *
 * Each angle adapts to the KIND of the newest line — a closed yes/no question,
 * an open "tell me / list" request, or a plain statement — so the user never
 * gets three vague variations of the same "yes".
 */
const ANGLES = [
  [
    "SLOT 1.",
    "If the newest line is a CLOSED yes/no question: answer YES clearly, then one concrete supporting detail (where, how long, what exactly).",
    "If it is an OPEN / enumeration request (tell me about…, what can you do, give examples, why): give the strongest single item with a concrete specific — never a generic 'I can do many things'.",
    "If it is a statement or small talk: respond directly and concretely to its content.",
  ].join(" "),
  [
    "SLOT 2 — must contrast with slot 1.",
    "If the newest line is a CLOSED yes/no question: answer NO / not yet honestly, then one short recovery (adjacent experience, willing to learn fast). Never produce a yes-type answer here.",
    "If it is an OPEN / enumeration request: answer in a structured list of 2-3 short points instead of one item.",
    "If it is a statement or small talk: reply from a different angle — your own reaction, feeling or a related fact.",
  ].join(" "),
  [
    "SLOT 3 — must differ from both slot 1 and slot 2.",
    "If the newest line is a CLOSED yes/no question: give a PARTIAL / conditional answer (a little, in a similar role, depends on the system) or ask one natural clarifying question back.",
    "If it is an OPEN / enumeration request: ask a scoping question back (which part matters most to you?) or answer with one concrete story/example.",
    "If it is a statement or small talk: keep the conversation moving with a natural follow-up question.",
  ].join(" "),
] as const;

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
        const emotionMod = import("@/lib/kibo/emotion.server");
        const [aiModels, coachPrompt] = await Promise.all([getAiModels(), getCoachPrompt()]);

        const convLang = body.conversationLang ?? "en";
        const target = LANG_NAME[convLang] ?? "English";
        const ui = LANG_NAME[body.uiLang ?? "en"] ?? "English";
        // Furigana is only meaningful for Japanese; English and Chinese never
        // get readings, which also keeps their answers shorter and faster.
        const wantsRuby = convLang === "ja";
        const transcript = body.turns
          .slice(-12)
          .map((t) => `${t.speaker === "user" ? "ME" : "OTHER"}: ${t.text}`)
          .join("\n");
        const latest =
          (body.latest ?? "").trim() ||
          [...body.turns]
            .reverse()
            .find((t) => t.speaker === "other")
            ?.text.trim() ||
          "";

        // Emotion-intelligence read of the moment: dictionary match on the
        // newest line plus the user's own last line, so replies serve the
        // real communication need instead of just answering the words.
        let briefing = "";
        try {
          const { loadEmotionLibrary, matchEmotions, emotionBriefing } = await emotionMod;
          // A cold library read must never hold up the first token: if it is not
          // ready fast, skip the briefing and let the cache warm for next time.
          const rows = await Promise.race([
            loadEmotionLibrary(),
            new Promise<null>((r) => setTimeout(() => r(null), 200)),
          ]);
          if (rows) {
            const myLast = [...body.turns].reverse().find((t) => t.speaker === "user")?.text ?? "";
            const matches = matchEmotions(`${latest}\n${myLast}`, rows, 3);
            briefing = emotionBriefing(matches);
          }
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

        const shape = wantsRuby
          ? `Answer with ONE JSON object and nothing else — no markdown fence, no prose: {"targetText":"<the reply in ${target}>","meaning":"<one short line in ${ui}>","segments":[{"t":"<surface chunk>","r":"<hiragana reading, only for chunks containing kanji; omit otherwise>"}]}. The segments joined by "t" must equal targetText exactly.`
          : `Answer with ONE JSON object and nothing else — no markdown fence, no prose: {"targetText":"<the reply in ${target}>","meaning":"<one short line in ${ui}>"}. No other keys — no readings, no pinyin, no furigana.`;

        const system = (angle: string) =>
          [
            `You are a real-time conversation coach. The user is speaking ${target} with another person.`,
            `The transcript is ordered oldest to newest; the LAST "OTHER" line is the message that was just received.`,
            latest
              ? `Reply directly to this newest line from the other person: "${latest}". Earlier turns are background context only — never answer an older line.`
              : ``,
            memoryBlock,
            briefing,
            coachPrompt,
            `First silently decide what kind of line the newest OTHER line is: a CLOSED yes/no question, an OPEN request to explain or list things, or a plain statement / small talk. Then shape the reply for that kind — never give a vague generic yes or no.`,
            `The three suggestions shown to the user must cover genuinely different, usable options, so stay strictly inside your assigned angle even if another stance feels more likely.`,
            `Propose exactly ONE short, natural reply the user could say next, in ${target}.`,
            `Angle for this reply: ${angle}`,

            LEVEL_HINT[body.level ?? "beginner"] ?? "",
            shape,
            `Keep targetText under 30 characters (up to 60 only when your angle asks for a 2-3 point list, separated by "、" or ", ") and meaning under 20 characters.`,
          ]
            .filter(Boolean)
            .join(" ");

        const userContent = transcript
          ? `${transcript}\n\n[Reply to the newest OTHER line: ${latest || "(none)"}]`
          : "(the conversation just started)";

        const wantsStream = body.stream !== false;

        const call = (angle: string) =>
          fetch("https://api.deepseek.com/chat/completions", {
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
              max_tokens: wantsRuby ? 260 : 140,
              messages: [
                { role: "system", content: system(angle) },
                { role: "user", content: userContent },
              ],
            }),
          });

        // Three independent generations start at the same moment.
        const settled = await Promise.allSettled(ANGLES.map((a) => call(a)));
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

        // Non-streaming clients get all finished replies in one plain body.
        // The client parser splits on `"targetText"`, so concatenation is enough.
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

        // Merge the three upstream streams into one SSE, tagging every delta
        // with its slot so the client can fill the notes independently.
        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          start(controller) {
            // Flush headers + an opening frame immediately so proxies release
            // the response before the model has produced anything.
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
                        choices?: { delta?: { content?: string } }[];
                      };
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
