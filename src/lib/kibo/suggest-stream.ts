import type { Candidate, Segment } from "./types";

export type SuggestStreamInput = {
  turns: { speaker: "user" | "other"; text: string }[];
  /** The line the suggestions must answer. */
  latest: string;
  conversationLang: string;
  uiLang: string;
  level: string;
};

type RawCandidate = {
  targetText?: string;
  meaning?: string;
  segments?: { t?: string; r?: string; role?: string }[];
};

const ROLES = new Set(["content", "particle", "punct"]);

function normalize(raw: RawCandidate): Candidate | null {
  const text = (raw.targetText ?? "").trim();
  if (!text) return null;
  const segments = Array.isArray(raw.segments)
    ? raw.segments
        .map((s): Segment | null => {
          const t = (s?.t ?? "").toString();
          if (!t) return null;
          const raw = (s?.r ?? "").toString().trim();
          // A reading identical to the surface adds nothing above the text.
          const r = raw === t ? "" : raw;
          const role: Segment["role"] = ROLES.has(s?.role ?? "")
            ? (s?.role as NonNullable<Segment["role"]>)
            : "content";
          return r ? { t, r, role } : { t, role };


        })
        .filter((s): s is Segment => s !== null)
    : [];
  return {
    text,
    meaning: (raw.meaning ?? "").trim(),
    ...(segments.length > 0 ? { segments } : {}),
  };
}

/**
 * Parse the NDJSON answer. Complete lines parse strictly; the line still being
 * generated is salvaged with a shallow scan so text appears as it streams.
 */
export function parseCandidates(buffer: string): Candidate[] {
  const lines = buffer.split("\n");
  const out: Candidate[] = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim().replace(/^```(?:json)?$/i, "");
    if (!trimmed || trimmed.startsWith("```")) return;
    try {
      const parsed = normalize(JSON.parse(trimmed) as RawCandidate);
      if (parsed) out.push(parsed);
      return;
    } catch {
      /* falls through to the partial reader below */
    }
    // Only the final line may legitimately be incomplete.
    if (index !== lines.length - 1) return;
    const text = /"targetText"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(trimmed)?.[1];
    const meaning = /"meaning"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(trimmed)?.[1];
    if (text) {
      try {
        out.push({
          text: JSON.parse(`"${text}"`) as string,
          meaning: meaning ? (JSON.parse(`"${meaning}"`) as string) : "",
        });
      } catch {
        /* mid-escape sequence — wait for the next frame */
      }
    }
  });

  return out.slice(0, 3);
}

function sameSegments(a?: Segment[], b?: Segment[]) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((s, i) => s.t === b[i]?.t && s.r === b[i]?.r && s.role === b[i]?.role);
}

/** Reuse previous candidate objects when unchanged so React can bail out of re-renders. */
function reconcile(prev: Candidate[], next: Candidate[]): Candidate[] | null {
  const equal = (p: Candidate | undefined, c: Candidate) =>
    !!p && p.text === c.text && p.meaning === c.meaning && sameSegments(p.segments, c.segments);

  if (prev.length === next.length) {
    let same = true;
    const merged = next.map((c, i) => {
      const p = prev[i];
      if (equal(p, c)) return p as Candidate;
      same = false;
      return c;
    });
    return same ? null : merged;
  }
  return next.map((c, i) => (equal(prev[i], c) ? (prev[i] as Candidate) : c));
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

