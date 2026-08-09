export type AiModels = {
  suggest: string;
  summary: string;
  transcribe: string;
};

export const DEFAULT_MODELS: AiModels = {
  // DeepSeek official API model ids.
  suggest: "deepseek-v4-flash",
  summary: "deepseek-v4-flash",
  // Volcengine streaming ASR resource id.
  transcribe: "volc.bigasr.sauc.duration",
};

let cache: { at: number; models: AiModels } | null = null;

/** Reads the admin-configured models from app_settings (cached for 30s). */
export async function getAiModels(): Promise<AiModels> {
  if (cache && Date.now() - cache.at < 30_000) return cache.models;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_models")
      .maybeSingle();
    const value = (data?.value ?? {}) as Partial<AiModels>;
    const models: AiModels = {
      suggest: value.suggest || DEFAULT_MODELS.suggest,
      summary: value.summary || DEFAULT_MODELS.summary,
      transcribe: value.transcribe || DEFAULT_MODELS.transcribe,
    };
    cache = { at: Date.now(), models };
    return models;
  } catch {
    return DEFAULT_MODELS;
  }
}
