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

const STR = (key: string) => new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"?`);
const unquote = (v: string | undefined) => {
  if (!v) return "";
  try {
    return JSON.parse(`"${v}"`) as string;
  } catch {
    return ""; // half-written escape — it lands on the next frame
  }
};

/**
 * Pull the suggestions out of the streamed answer. Each suggestion starts at a
 * `"targetText"` key, so the buffer is simply cut on that key and each chunk is
 * read with a regex — that works for one-object-per-line, code fences, arrays,
 * pretty-printed JSON and the half-finished object at the end alike.
 */
export function parseCandidates(buffer: string): Candidate[] {
  const chunks = buffer.split(/(?="targetText"\s*:)/).slice(1);

  const out = chunks
    .map((chunk): Candidate | null => {
      const text = unquote(STR("targetText").exec(chunk)?.[1]).trim();
      if (!text) return null;
      const meaning = unquote(STR("meaning").exec(chunk)?.[1]).trim();
      const segments = parseSegments(chunk);
      return { text, meaning, ...(segments.length > 0 ? { segments } : {}) };
    })
    .filter((c): c is Candidate => c !== null);

  if (out.length > 0) return out.slice(0, 3);

  // The model ignored the JSON shape: show its plain lines instead of nothing.
  return buffer
    .split("\n")
    .map((l) => l.replace(/```(?:json)?/gi, "").replace(/^(?:[-*]|\d+[.)])\s+/, "").trim())
    .filter((l) => l.length > 0 && !l.startsWith("{") && !l.startsWith("["))
    .slice(0, 3)
    .map((text) => ({ text, meaning: "" }));
}

/** Reads the `segments` array of one chunk; missing or unfinished → no ruby. */
function parseSegments(chunk: string): Segment[] {
  const raw = /"segments"\s*:\s*(\[[\s\S]*?\])/.exec(chunk)?.[1];
  if (!raw) return [];
  let parsed: RawCandidate["segments"];
  try {
    parsed = JSON.parse(raw) as RawCandidate["segments"];
  } catch {
    return [];
  }
  return (parsed ?? [])
    .map((s): Segment | null => {
      const t = (s?.t ?? "").toString();
      if (!t) return null;
      // A reading identical to the surface adds nothing above the text.
      const r = (s?.r ?? "").toString().trim();
      const role: Segment["role"] = ROLES.has(s?.role ?? "")
        ? (s?.role as NonNullable<Segment["role"]>)
        : "content";
      return r && r !== t ? { t, r, role } : { t, role };
    })
    .filter((s): s is Segment => s !== null);
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

