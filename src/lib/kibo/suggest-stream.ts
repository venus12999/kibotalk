import { SuggestError } from "./ai-error";
import type { Candidate, Segment } from "./types";

export type SuggestStreamInput = {
  turns: { speaker: "user" | "other"; text: string }[];
  /** The line the suggestions must answer. */
  latest: string;
  conversationLang: string;
  uiLang: string;
  level: string;
  /** Persistent "who am I" line built from the user's profile fields. */
  profile?: string;
  /** Compact Kibo Memory entries the coach should keep in mind. */
  memory?: string[];
};

type RawCandidate = {
  targetText?: string;
  meaning?: string;
  segments?: { t?: string; r?: string; role?: string }[];
};

const ROLES = new Set(["content", "particle", "punct"]);

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
    .map((l) =>
      l
        .replace(/```(?:json)?/gi, "")
        .replace(/^(?:[-*]|\d+[.)])\s+/, "")
        .trim(),
    )
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
 * Non-streaming fallback: ask the server for the finished answer in one plain
 * body. Mobile browsers and in-app WebViews that cannot read a live stream
 * (older iOS Safari, WeChat) end up here instead of showing an empty result.
 */
async function fetchWhole(input: SuggestStreamInput, signal?: AbortSignal): Promise<Candidate[]> {
  const { authHeaders } = await import("@/lib/kibo/api-auth");
  const headers = await authHeaders({ "Content-Type": "application/json" });
  const res = await fetch("/api/suggest", {
    method: "POST",
    headers,
    body: JSON.stringify({ ...input, stream: false }),
    signal: signal ?? null,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SuggestError(body || `HTTP ${res.status}`, { status: res.status });
  }
  return parseCandidates(await res.text());
}

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
    const { authHeaders } = await import("@/lib/kibo/api-auth");
    const headers = await authHeaders({ "Content-Type": "application/json" });
    res = await fetch("/api/suggest", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
      signal: signal ?? null,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new SuggestError(err instanceof Error ? err.message : "network error", {
      kind: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network",
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new SuggestError(body || `HTTP ${res.status}`, { status: res.status });
  }

  // Some mobile browsers (older iOS Safari, in-app WebViews such as WeChat)
  // expose no readable body. Fall back to reading the whole answer at once so
  // suggestions still appear instead of failing outright.
  if (!res.body || typeof res.body.getReader !== "function") {
    const raw = await res.text();
    const whole = raw
      .split("\n")
      .filter((l) => l.startsWith("data:"))
      .map((l) => {
        try {
          return (JSON.parse(l.slice(5).trim()) as { delta?: string }).delta ?? "";
        } catch {
          return "";
        }
      })
      .join("");
    let candidates = parseCandidates(whole || raw);
    // A buffered body that carried nothing usable: retry without streaming.
    if (candidates.length === 0 && !signal?.aborted) {
      candidates = await fetchWhole(input, signal);
    }
    if (candidates.length > 0) onUpdate(candidates);
    return candidates;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let sse = "";
  // One buffer per slot: the three replies are generated in parallel upstream,
  // so a slow one never blocks the others from rendering.
  const slots = ["", "", ""];
  // Older servers send untagged deltas containing all three replies at once.
  let legacy = false;

  const readSlots = (): Candidate[] => {
    if (legacy) return parseCandidates(slots[0] ?? "");
    const parsed = slots.map((s) => parseCandidates(s)[0] ?? { text: "", meaning: "" });
    // Trim trailing empty slots so nothing renders before it exists.
    let end = parsed.length;
    while (end > 0 && !parsed[end - 1]?.text) end -= 1;
    return parsed.slice(0, end);
  };
  const filled = (list: Candidate[]) => list.filter((c) => c.text.length > 0);

  let emitted: Candidate[] = [];
  let frame = 0;
  let dirty = false;

  const flush = () => {
    frame = 0;
    if (!dirty) return;
    dirty = false;
    const merged = reconcile(emitted, readSlots());
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
    const ms = slots.some(Boolean) ? 20000 : 30000;
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
          const { delta, i } = JSON.parse(line.slice(5).trim()) as { delta?: string; i?: number };
          if (!delta) continue;
          if (typeof i === "number" && i >= 0 && i < slots.length) {
            slots[i] += delta;
          } else {
            legacy = true;
            slots[0] += delta;
          }
          markDirty();
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

  const final = filled(reconcile(emitted, readSlots()) ?? emitted);
  // The stream ended without a single usable suggestion (some mobile networks
  // and WebViews silently swallow event-stream frames): ask again without
  // streaming so the user still gets ideas instead of an empty card.
  if (final.length === 0 && !signal?.aborted) {
    const whole = await fetchWhole(input, signal);
    if (whole.length > 0) onUpdate(whole);
    return whole;
  }
  return final;
}
