import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

/** Strip PostgREST `.or()` filter metacharacters so dotted queries don't break. */
function sanitizeQuery(raw: string): string {
  return raw
    .trim()
    .replace(/[%(),."'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export default defineTool({
  name: "search_emotions",
  title: "Search the emotion library",
  description:
    "Look up entries in KiboTalk's emotion intelligence library by keyword, emotion name, or scenario, with the recommended response strategy.",
  inputSchema: {
    query: z
      .string()
      .describe("Word or phrase to look for in the emotion, scenario, text pattern, or keywords."),
    limit: z.number().int().optional().describe("How many entries to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 10, 1), 50);
    const supabase = supabaseForUser(ctx);
    const q = sanitizeQuery(query);
    if (!q) {
      return { content: [{ type: "text", text: "Empty query" }], isError: true };
    }
    // Quote patterns so spaces / reserved chars don't break `.or()` parsing.
    const pattern = `"%${q}%"`;
    const filters = [
      `emotion.ilike.${pattern}`,
      `scenario.ilike.${pattern}`,
      `text_pattern.ilike.${pattern}`,
    ];
    // Exact keyword token match when the query is a single word (uses GIN index).
    if (!/\s/.test(q)) {
      filters.push(`keywords.cs.{${q}}`);
    }

    const { data, error } = await supabase
      .from("emotion_intelligence")
      .select(
        "emotion, emotion_category, communication_state, scenario, text_pattern, user_need, ai_response_strategy, keywords",
      )
      .or(filters.join(","))
      .limit(take);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    // Phrase queries: also keep rows whose keywords array overlaps any token.
    const tokens = q.toLowerCase().split(" ").filter(Boolean);
    const rows = (data ?? []).filter((row) => {
      if (tokens.length <= 1) return true;
      const keys = ((row.keywords ?? []) as string[]).map((k) => k.toLowerCase());
      return tokens.some((t) => keys.some((k) => k.includes(t) || t.includes(k)));
    });

    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { entries: rows },
    };
  },
});
