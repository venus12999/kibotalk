import type { Candidate, ConvLang, Turn } from "./types";

export const voiceprintPhrase: Record<ConvLang, string> = {
  ja: "こんにちは。今日もよろしくお願いします。最近は外国語の会話を練習しています。ゆっくり、はっきり、自分らしく話します。",
  en: "Hello, it is good to see you today. I have been practising conversation in another language. I speak slowly, clearly, and in my own voice.",
  zh: "你好，今天也请多关照。我最近在练习外语对话。我会慢慢地、清楚地、用自己的方式说话。",
};

type ScriptStep = {
  speaker: "user" | "other";
  text: string;
  candidates?: Candidate[];
};

export const script: Record<ConvLang, ScriptStep[]> = {
  ja: [
    {
      speaker: "other",
      text: "はじめまして。今日はお時間をいただきありがとうございます。",
      candidates: [
        { text: "こちらこそ、よろしくお願いします。", meaning: "Likewise, nice to meet you." },
        {
          text: "お会いできてうれしいです。お忙しいところありがとうございます。",
          meaning: "Glad to meet you. Thanks for making time.",
        },
        {
          text: "ありがとうございます。さっそく始めましょうか。",
          meaning: "Thank you. Shall we get started?",
        },
      ],
    },
    { speaker: "user", text: "こちらこそ、よろしくお願いします。" },
    {
      speaker: "other",
      text: "普段はどんなお仕事をされていますか。",
      candidates: [
        {
          text: "デザインの仕事をしています。主にアプリの画面を作っています。",
          meaning: "I work in design, mostly app screens.",
        },
        {
          text: "小さな会社でエンジニアをしています。",
          meaning: "I'm an engineer at a small company.",
        },
        { text: "今は勉強しながら、副業をしています。", meaning: "I study and freelance for now." },
      ],
    },
    {
      speaker: "user",
      text: "デザインの仕事をしています。主にアプリの画面を作っています。",
    },
    {
      speaker: "other",
      text: "いいですね。日本語はどのくらい勉強していますか。",
      candidates: [
        { text: "半年くらいです。まだ初級です。", meaning: "About six months. Still a beginner." },
        {
          text: "一年ほどですが、話すのはまだ苦手です。",
          meaning: "About a year, but speaking is still hard.",
        },
        {
          text: "毎日少しずつ練習しています。会話は今日が二回目です。",
          meaning: "I practise a little daily. This is my second conversation.",
        },
      ],
    },
  ],
  en: [
    {
      speaker: "other",
      text: "Hi, thanks for hopping on the call today.",
      candidates: [
        { text: "Thanks for having me — happy to be here.", meaning: "谢谢邀请，很高兴参加。" },
        { text: "Of course. Good to finally meet you.", meaning: "当然，很高兴终于见到你。" },
        { text: "No problem at all. Shall we get started?", meaning: "没问题，我们开始吧？" },
      ],
    },
    { speaker: "user", text: "Thanks for having me — happy to be here." },
    {
      speaker: "other",
      text: "So, what does your team work on day to day?",
      candidates: [
        {
          text: "We design product interfaces, mostly for mobile apps.",
          meaning: "我们做产品界面设计，主要是移动端。",
        },
        {
          text: "I lead a small team of three designers and one researcher.",
          meaning: "我带一个三名设计师和一名研究员的小团队。",
        },
        {
          text: "Right now we're rebuilding our onboarding flow.",
          meaning: "我们正在重做新用户引导流程。",
        },
      ],
    },
    { speaker: "user", text: "We design product interfaces, mostly for mobile apps." },
    {
      speaker: "other",
      text: "Nice. What's the hardest part of that work?",
      candidates: [
        {
          text: "Keeping things simple when everyone wants more features.",
          meaning: "在大家都想加功能时保持简洁。",
        },
        {
          text: "Getting real user feedback early enough.",
          meaning: "足够早地拿到真实用户反馈。",
        },
        { text: "Honestly, saying no to good ideas.", meaning: "说实话，是拒绝那些好点子。" },
      ],
    },
  ],
  zh: [
    {
      speaker: "other",
      text: "你好，今天很高兴能和你聊聊。",
      candidates: [
        { text: "我也很高兴，谢谢你抽时间。", meaning: "Likewise, thanks for making time." },
        { text: "谢谢，我们可以开始了吗？", meaning: "Thanks — shall we start?" },
        { text: "彼此彼此，请多指教。", meaning: "Same here, looking forward to it." },
      ],
    },
    { speaker: "user", text: "我也很高兴，谢谢你抽时间。" },
    {
      speaker: "other",
      text: "你平时做什么工作呢？",
      candidates: [
        { text: "我做产品设计，主要是手机应用的界面。", meaning: "I design mobile app interfaces." },
        { text: "我在一家小公司做工程师。", meaning: "I'm an engineer at a small company." },
        { text: "我一边学习，一边做一些自由职业。", meaning: "I study and freelance." },
      ],
    },
    { speaker: "user", text: "我做产品设计，主要是手机应用的界面。" },
    {
      speaker: "other",
      text: "很有意思。你学中文多久了？",
      candidates: [
        { text: "差不多半年，还是初级水平。", meaning: "About six months, still beginner." },
        { text: "一年左右，但说得还不太流利。", meaning: "About a year, not fluent yet." },
        { text: "我每天都练一点点。", meaning: "I practise a little every day." },
      ],
    },
  ],
};

export const summaryText: Record<ConvLang, string> = {
  ja: "自己紹介と仕事の話題を中心に会話しました。丁寧体は安定していますが、理由を述べる「〜ので」の使い分けを復習すると自然になります。",
  en: "You covered introductions and your day-to-day work. Your sentence rhythm was steady; try adding one concrete example per answer to sound more natural.",
  zh: "本次会话围绕自我介绍与工作展开。表达清晰，建议在回答中多加一个具体例子，会更自然。",
};

export const makeTurn = (speaker: Turn["speaker"], text: string): Turn => ({
  id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  speaker,
  text,
  at: Date.now(),
});
