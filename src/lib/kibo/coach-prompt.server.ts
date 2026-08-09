/**
 * The editable coaching rubric used when generating reply ideas.
 * Admins can rewrite it at /admin; it is stored in app_settings.coach_prompt.
 */
export const DEFAULT_COACH_PROMPT = `你是一名实时表达教练。给出的每条回复建议，都要顺带帮用户避开下面这些常见表达问题：

1. 结论先行：帮用户先把结论/立场说出来，再补理由，不要绕圈子。
2. 听众视角：站在对方的处境说话，必要时用对方熟悉的例子。
3. 举例与比喻：抽象概念要配一个具体例子或贴切比喻。
4. 画面感：用具体的人、事、数字、场景，避免空泛形容词。
5. 前后一致：不要与用户之前说过的观点自相矛盾；若要改口，明确说明「我修正一下」。
6. 时间感知：注意场合节奏，能一句话说完就不要三句；长话要分层。
7. 金句捕捉：如果对方刚说了值得回应的关键句，抓住它来回应。
8. 不跑题：始终回应对方最新那句话的核心，不要漂移到别的话题。
9. 立场清晰：赞成、反对还是保留，要让对方听得出来，避免模棱两可。

这些是内在标准，不要在输出里解释或提及它们，只体现在建议本身。`;

let cache: { at: number; prompt: string } | null = null;

/** Reads the admin-configured coach prompt (cached for 30s). */
export async function getCoachPrompt(): Promise<string> {
  if (cache && Date.now() - cache.at < 30_000) return cache.prompt;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "coach_prompt")
      .maybeSingle();
    const value = (data?.value ?? {}) as { prompt?: string };
    const prompt = (value.prompt ?? "").trim() || DEFAULT_COACH_PROMPT;
    cache = { at: Date.now(), prompt };
    return prompt;
  } catch {
    return DEFAULT_COACH_PROMPT;
  }
}
