UPDATE public.app_settings
SET value = jsonb_build_object(
  'suggest', 'deepseek-v4-flash',
  'summary', 'deepseek-v4-flash',
  'transcribe', 'volc.bigasr.sauc.duration'
)
WHERE key = 'ai_models';

INSERT INTO public.app_settings (key, value)
SELECT 'ai_models', jsonb_build_object(
  'suggest', 'deepseek-v4-flash',
  'summary', 'deepseek-v4-flash',
  'transcribe', 'volc.bigasr.sauc.duration'
)
WHERE NOT EXISTS (SELECT 1 FROM public.app_settings WHERE key = 'ai_models');