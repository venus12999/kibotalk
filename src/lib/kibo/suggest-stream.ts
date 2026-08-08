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

/**
 * Streams reply suggestions and calls `onUpdate` on every token so the UI can
 * render the answer as it is generated.
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sse += decoder.decode(value, { stream: true });
    const frames = sse.split("\n\n");
    sse = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const { delta } = JSON.parse(line.slice(5).trim()) as { delta?: string };
        if (delta) {
          text += delta;
          onUpdate(parseCandidates(text));
        }
      } catch {
        /* ignore */
      }
    }
  }

  return parseCandidates(text);
}
