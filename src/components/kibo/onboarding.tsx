import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PillGroup } from "./pill-group";
import { UiLanguageMenu } from "./ui-language-menu";
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

export function Onboarding({ onContinue }: { onContinue: () => void }) {
  const { prefs, setPrefs, t } = useKibo();
  const ui = prefs.uiLang;

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

      <Button
        size="pill"
        className="mt-7"
        onClick={() => {
          setPrefs({ onboarded: true });
          onContinue();
        }}
      >
        <ArrowRight className="size-4" />
        {t("continueVoiceprint")}
      </Button>
    </div>
  );
}
