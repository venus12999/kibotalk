import { SuggestError } from "./ai-error";
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
 * Extract every top-level {...} span from the buffer, ignoring braces inside
 * strings. The last span may still be incomplete while streaming.
 */
function scanObjects(buffer: string): { body: string; complete: boolean }[] {
  const out: { body: string; complete: boolean }[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < buffer.length; i++) {
    const ch = buffer[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start >= 0) {
        out.push({ body: buffer.slice(start, i + 1), complete: true });
        start = -1;
      }
      if (depth < 0) depth = 0;
    }
  }
  if (depth > 0 && start >= 0) out.push({ body: buffer.slice(start), complete: false });
  return out;
}

/**
 * Parse the streamed answer. The model is asked for one JSON object per line,
 * but it sometimes wraps them in a markdown fence, pretty-prints them, or emits
 * a JSON array — so objects are recovered by brace scanning instead of by line.
 * The object still being generated is salvaged with a shallow scan so text
 * appears as it streams, and a model that ignores JSON entirely still yields
 * plain-text replies rather than an empty result.
 */
export function parseCandidates(buffer: string): Candidate[] {
  const out: Candidate[] = [];
  const spans = scanObjects(buffer);

  for (const span of spans) {
    if (span.complete) {
      try {
        const parsed = normalize(JSON.parse(span.body) as RawCandidate);
        if (parsed) out.push(parsed);
        continue;
      } catch {
        /* falls through to the partial reader below */
      }
    }
    const text = /"targetText"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(span.body)?.[1];
    const meaning = /"meaning"\s*:\s*"((?:[^"\\]|\\.)*)/.exec(span.body)?.[1];
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
  }

  if (out.length === 0) {
    // No JSON at all: fall back to the plain lines the model produced.
    const plain = buffer
      .split("\n")
      .map((l) => l.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim())
      .map((l) => l.replace(/^(?:[-*]|\d+[.)])\s+/, "").trim())
      .filter((l) => l.length > 0 && !l.startsWith("{"));
    for (const line of plain) out.push({ text: line, meaning: "" });
  }

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
  let res: Response;
  try {
    res = await fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal: signal ?? null,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new SuggestError(err instanceof Error ? err.message : "network error", {
      kind: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network",
    });
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new SuggestError(body || `HTTP ${res.status}`, { status: res.status });
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

  // A stream that goes quiet is indistinguishable from a hang, so treat a long
  // silence as an explicit timeout instead of waiting forever.
  const readWithTimeout = async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ms = text ? 20000 : 30000;
    try {
      return await Promise.race([
        reader.read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new SuggestError(`stream timeout after ${ms}ms`, { kind: "timeout" })),
            ms,
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  try {
    while (true) {
      const { done, value } = await readWithTimeout();
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

