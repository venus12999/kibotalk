import * as React from "react";
import { ArrowRight, ArrowLeft, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PillGroup } from "./pill-group";
import { UiLanguageMenu } from "./ui-language-menu";
import { GuideContent } from "./guide-content";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import type { ConvLang, Level } from "@/lib/kibo/types";

const translateCopy = {
  zh: { label: "翻译语言", hint: "把对方说的话翻译成这个语言显示" },
  ja: { label: "翻訳言語", hint: "相手の発話をこの言語に翻訳して表示します" },
  en: {
    label: "Translation language",
    hint: "Show the other person's lines translated into this language",
  },
} as const;

const guideCopy = {
  zh: { next: "下一步：怎么用", back: "上一步", start: "我知道了，开始使用" },
  ja: { next: "次へ：使い方", back: "戻る", start: "はじめる" },
  en: { next: "Next: how to use", back: "Back", start: "Got it, start" },
} as const;

export function Onboarding({ onContinue }: { onContinue: () => void }) {
  const { prefs, setPrefs, t } = useKibo();
  const ui = prefs.uiLang;
  const [step, setStep] = React.useState<0 | 1>(0);
  const g = guideCopy[ui] ?? guideCopy.en;

  if (step === 1) {
    return (
      <div className="paper-sheet flex max-h-[88dvh] w-full max-w-md flex-col p-6 sm:p-7">
        <ScrollArea className="min-h-0 flex-1 pr-2">
          <GuideContent />
        </ScrollArea>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="soft" size="pill" className="flex-none" onClick={() => setStep(0)}>
            <ArrowLeft className="size-4" />
            {g.back}
          </Button>
          <Button
            size="pill"
            className="min-w-0 flex-1 whitespace-normal px-3 text-center"
            onClick={() => {
              navigator.vibrate?.(12);
              setPrefs({ onboarded: true });
              onContinue();
            }}
          >
            <Rocket className="size-4" />
            {g.start}
          </Button>
        </div>

      </div>
    );
  }

  return (
    <div className="paper-sheet w-full max-w-md p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("selectLanguage")}</h1>
        <UiLanguageMenu />
      </div>
      <p className="mt-2 text-sm text-muted-foreground">{t("onboardingDescription")}</p>

      <div className="mt-6 space-y-5">
        <PillGroup<ConvLang>
          label={t("conversationLanguage")}
          value={prefs.conversationLang}
          onChange={(v) => setPrefs({ conversationLang: v })}
          options={[
            { value: "ja", label: langLabel("ja", ui) },
            { value: "en", label: langLabel("en", ui) },
            { value: "zh", label: langLabel("zh", ui) },
          ]}
        />
        <div>
          <PillGroup<ConvLang>
            label={translateCopy[ui].label}
            value={prefs.translateLang}
            onChange={(v) => setPrefs({ translateLang: v })}
            options={[
              { value: "ja", label: langLabel("ja", ui) },
              { value: "en", label: langLabel("en", ui) },
              { value: "zh", label: langLabel("zh", ui) },
            ]}
          />
          <p className="mt-1.5 text-xs text-muted-foreground">{translateCopy[ui].hint}</p>
        </div>
        <PillGroup<Level>
          label={`${t("level")} · ${langLabel(prefs.conversationLang, ui)}`}
          value={prefs.level}
          onChange={(v) => setPrefs({ level: v })}
          options={[
            { value: "beginner", label: levelLabel("beginner", ui) },
            { value: "intermediate", label: levelLabel("intermediate", ui) },
            { value: "advanced", label: levelLabel("advanced", ui) },
          ]}
        />
      </div>

      <Button size="pill" className="mt-7" onClick={() => setStep(1)}>
        <ArrowRight className="size-4" />
        {g.next}
      </Button>
    </div>
  );
}
