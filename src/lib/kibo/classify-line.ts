/**
 * Cheap local classifier for the newest OTHER line.
 * Keeps the "what kind of turn is this?" step off the LLM so DeepSeek only
 * writes the short reply — no silent planning, no thinking tokens.
 */

export type LineKind = "closed" | "open" | "statement";

const CLOSED_RE =
  /^(?:(?:so|well|um+|uh+|okay|ok|right|hey)[,!.…]?\s+)?(?:(?:do|does|did|is|are|was|were|have|has|had|can|could|will|would|shall|should|may|might|must)\b|aren't|isn't|don't|doesn't|didn't|haven't|hasn't|won't|can't|couldn't|wouldn't|shouldn't)|[?？]\s*$|吗[?？]?$|麼[?？]?$|か[?？]?$|ですか[?？]?$|でしょうか[?？]?$/i;

const OPEN_RE =
  /^(?:what|which|who|whom|whose|where|when|why|how)\b|tell me|explain|describe|give (?:me )?(?:an? |some )?examples?|list|どんな|なに|何|どう|なぜ|どこ|いつ|だれ|誰|怎么|什么|哪儿|哪里|为什么|哪些|请?告诉我|介绍一下/i;

/** Classify the line the user must answer next. */
export function classifyLine(text: string): LineKind {
  const t = text.trim();
  if (!t) return "statement";

  // Open WH- / “tell me” requests first — "what do you…" is open, not closed.
  if (OPEN_RE.test(t)) return "open";

  const looksClosed =
    CLOSED_RE.test(t) ||
    (/[?？]\s*$/.test(t) &&
      /^(?:do|does|did|is|are|was|were|have|has|can|could|will|would|should|may|might)\b/i.test(t));

  if (looksClosed) return "closed";
  if (/[?？]\s*$/.test(t)) return "open";
  return "statement";
}

/** One short instruction per suggestion slot, given the line kind. */
export function angleFor(kind: LineKind, slot: 0 | 1 | 2): string {
  if (kind === "closed") {
    return (
      [
        "Answer YES clearly, then one concrete supporting detail.",
        "Answer NO / not yet honestly, then one short recovery. Never yes here.",
        "Give a PARTIAL / conditional answer, or ask one natural clarifying question.",
      ] as const
    )[slot];
  }
  if (kind === "open") {
    return (
      [
        "Give the strongest single concrete item — never a generic 'I can do many things'.",
        "Answer as a short list of 2-3 points.",
        "Ask one scoping question, or answer with one concrete example/story.",
      ] as const
    )[slot];
  }
  return (
    [
      "Respond directly and concretely to the content.",
      "Reply from a different angle — your reaction, feeling, or a related fact.",
      "Keep it moving with one natural follow-up question.",
    ] as const
  )[slot];
}
