import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "search_emotions",
  title: "Search the emotion library",
  description:
    "Look up entries in KiboTalk's emotion intelligence library by keyword, emotion name, or scenario, with the recommended response strategy.",
  inputSchema: {
    query: z
      .string()
      .describe("Word or phrase to look for in the emotion, scenario, or text pattern."),
    limit: z.number().int().optional().describe("How many entries to return (default 10, max 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const take = Math.min(Math.max(limit ?? 10, 1), 50);
    const supabase = supabaseForUser(ctx);
    const q = query.trim().replace(/[%,]/g, " ");
    const { data, error } = await supabase
      .from("emotion_intelligence")
      .select(
        "emotion, emotion_category, communication_state, scenario, text_pattern, user_need, ai_response_strategy",
      )
      .or(`emotion.ilike.%${q}%,scenario.ilike.%${q}%,text_pattern.ilike.%${q}%`)
      .limit(take);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { entries: data ?? [] },
    };
  },
});
