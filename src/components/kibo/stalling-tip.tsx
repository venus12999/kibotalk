import * as React from "react";
import { cn } from "@/lib/utils";

const PHRASES: Record<string, string[]> = {
  en: [
    "You know what…",
    "Let me think about that for a sec.",
    "Hmm, good question.",
    "Hold on, I want to get this right.",
    "So basically…",
    "That's a really interesting point.",
    "Let me put it this way…",
  ],
  ja: [
    "えーと…",
    "そうですね、少し考えさせてください。",
    "いい質問ですね。",
    "うーん、整理すると…",
    "つまり、そういうことですね。",
    "正確に伝えたいので、少し待ってください。",
    "それは興味深い点ですね。",
  ],
  zh: [
    "这个嘛……",
    "让我想想。",
    "嗯，你问得很好。",
    "稍等，我想表达准确一点。",
    "其实吧……",
    "你这么一说，挺有意思的。",
    "我整理一下思路。",
  ],
};

const LABELS: Record<string, { title: string; hint: string }> = {
  en: { title: "Stalling phrase", hint: "Say this to buy time" },
  ja: { title: "時間稼ぎのフレーズ", hint: "考える時間を稼ぐときに" },
  zh: { title: "拖延小技巧", hint: "需要缓冲时间时可以说" },
};

/** A rotating set of natural "buy time" phrases shown while AI is thinking. */
export function StallingTip({
  show,
  lang,
  uiLang,
  className,
}: {
  show: boolean;
  lang: string;
  uiLang: string;
  className?: string;
}) {
  const phrases = PHRASES[lang] ?? PHRASES["en"];
  const [index, setIndex] = React.useState(0);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!show) {
      setVisible(false);
      return;
    }
    // Fade in on the first appearance.
    const fadeIn = setTimeout(() => setVisible(true), 60);
    return () => clearTimeout(fadeIn);
  }, [show]);

  React.useEffect(() => {
    if (!show) return;
    setIndex(0);
    const interval = setInterval(() => {
      setIndex((i) => (i + 1) % phrases.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [show, phrases.length]);

  const label = LABELS[uiLang] ?? LABELS["en"];

  return (
    <div
      className={cn(
        "pointer-events-none flex flex-col items-center gap-1 transition-all duration-300",
        visible && show ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0",
        className,
      )}
      aria-live="polite"
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-primary-foreground/70">
        {label.title}
      </p>
      <div
        className={cn(
          "max-w-[80vw] rounded-full px-4 py-2 text-center text-sm font-semibold leading-snug shadow-lg backdrop-blur-md",
          "bg-white/75 text-foreground/90 border border-white/70",
          "sm:max-w-md sm:text-base",
        )}
      >
        <span key={index} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {phrases[index]}
        </span>
      </div>
      <p className="text-[10px] text-foreground/55">{label.hint}</p>
    </div>
  );
}
