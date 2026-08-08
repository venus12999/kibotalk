import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PillGroup } from "./pill-group";
import { UiLanguageMenu } from "./ui-language-menu";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import type { ConvLang, Level } from "@/lib/kibo/types";

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
