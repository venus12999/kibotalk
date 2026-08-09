import type { ConvLang } from "./types";

/**
 * Short read-aloud lines used for voiceprint enrollment. Three sentences give
 * enough voiced audio (~10s) for a stable embedding.
 */
export const sampleLines: Record<ConvLang, string[]> = {
  ja: [
    "こんにちは、今日はいい天気ですね。",
    "私はこのアプリで会話の練習をしています。",
    "よろしくお願いします、ゆっくり話しましょう。",
  ],
  en: [
    "Hello, it is a really nice day today.",
    "I am using this app to practise real conversations.",
    "Nice to meet you, let's talk slowly and clearly.",
  ],
  zh: [
    "你好，今天的天气真不错。",
    "我正在用这个应用练习日常对话。",
    "很高兴认识你，我们慢慢聊。",
  ],
};
