import type { Candidate } from "./types";

export type SuggestStreamInput = {
  turns: { speaker: "user" | "other"; text: string }[];
  conversationLang: string;
  uiLang: string;
  level: string;
};

/** Split the streamed plain-text answer ("reply ||| note" per line) into candidates. */
export function parseCandidates(buffer: string): Candidate[] {
  return buffer
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => {
      const [text, meaning] = line.split("|||");
      return {
        text: (text ?? "").replace(/^\s*[-*\d.)]+\s*/, "").trim(),
        meaning: (meaning ?? "").trim(),
      };
    })
    .filter((c) => c.text.length > 0);
}

/** Reuse previous candidate objects when unchanged so React can bail out of re-renders. */
function reconcile(prev: Candidate[], next: Candidate[]): Candidate[] | null {
  if (prev.length === next.length) {
    let same = true;
    const merged = next.map((c, i) => {
      const p = prev[i];
      if (p && p.text === c.text && p.meaning === c.meaning) return p;
      same = false;
      return c;
    });
    return same ? null : merged;
  }
  return next.map((c, i) => {
    const p = prev[i];
    return p && p.text === c.text && p.meaning === c.meaning ? p : c;
  });
}

const schedule: (cb: () => void) => number =
  typeof requestAnimationFrame === "function"
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 33) as unknown as number;
const unschedule = (id: number) => {
  if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(id);
  else clearTimeout(id);
};

/**
 * Streams reply suggestions. Token deltas are accumulated and flushed to
 * `onUpdate` at most once per animation frame (and only when the parsed result
 * actually changed), so a fast token stream cannot outrun the renderer.
 */
export async function streamSuggestions(
  input: SuggestStreamInput,
  onUpdate: (candidates: Candidate[]) => void,
  signal?: AbortSignal,
): Promise<Candidate[]> {
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: signal ?? null,
  });

  if (!res.ok || !res.body) {
    throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sse = "";
  let text = "";

  let emitted: Candidate[] = [];
  let frame = 0;
  let dirty = false;

  const flush = () => {
    frame = 0;
    if (!dirty) return;
    dirty = false;
    const merged = reconcile(emitted, parseCandidates(text));
    if (merged) {
      emitted = merged;
      onUpdate(merged);
    }
  };
  const markDirty = () => {
    dirty = true;
    // rAF self-throttles on slow devices: no queue build-up, no wasted parses.
    if (!frame) frame = schedule(flush);
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sse += decoder.decode(value, { stream: true });
      const frames = sse.split("\n\n");
      sse = frames.pop() ?? "";
      for (const f of frames) {
        const line = f.split("\n").find((l) => l.startsWith("data:"));
        if (!line) continue;
        try {
          const { delta } = JSON.parse(line.slice(5).trim()) as { delta?: string };
          if (delta) {
            text += delta;
            markDirty();
          }
        } catch {
          /* ignore */
        }
      }
    }
  } finally {
    if (frame) unschedule(frame);
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }

  return reconcile(emitted, parseCandidates(text)) ?? emitted;
}

