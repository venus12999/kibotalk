import { createFileRoute } from "@tanstack/react-router";

const VOLC_LANG: Record<string, string> = {
  ja: "ja-JP",
  en: "en-US",
  zh: "zh-CN",
};

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { requireApiUser } = await import("@/lib/kibo/api-auth");
        const auth = await requireApiUser(request);
        if (auth instanceof Response) return auth;

        const appId = process.env["VOLC_ASR_APP_ID"] ?? process.env["VOLC_APP_ID"];
        const accessToken =
          process.env["VOLC_ASR_ACCESS_TOKEN"] ?? process.env["VOLC_ACCESS_TOKEN"];
        if (!appId || !accessToken) {
          return new Response("Transcription is not configured", { status: 503 });
        }

        const form = await request.formData().catch(() => null);
        if (!form) return new Response("Expected multipart audio upload", { status: 400 });

        const file = form.get("file");
        const language = form.get("language");

        if (!(file instanceof File) || file.size < 2048) {
          return new Response("Empty or invalid audio upload", { status: 400 });
        }
        if (file.size > 20 * 1024 * 1024) {
          return new Response("Audio file too large", { status: 413 });
        }

        const { getAiModels } = await import("@/lib/kibo/model-config.server");
        const { transcribeWithVolc } = await import("@/lib/kibo/volc-asr.server");
        const aiModels = await getAiModels();

        const wav = new Uint8Array(await file.arrayBuffer());
        return transcribeWithVolc(wav, {
          appId,
          accessToken,
          resourceId: aiModels.transcribe,
          language: typeof language === "string" ? VOLC_LANG[language] : undefined,
        });
      },
    },
  },
});
