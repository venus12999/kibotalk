import { Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { PillGroup } from "./pill-group";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import type { AudioSource, ConvLang, Level, NodeId, Theme, UiLang } from "@/lib/kibo/types";

function Row({
  title,
  description,
  children,
  danger,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <div className="flex min-h-16 flex-col gap-3 border-b border-border py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={danger ? "text-sm font-semibold text-destructive" : "text-sm font-semibold"}>
          {title}
        </p>
        {description ? (
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  locked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locked: boolean;
}) {
  const { prefs, setPrefs, t, clearHistory, reset } = useKibo();
  const ui = prefs.uiLang;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{t("settings")}</SheetTitle>
        </SheetHeader>

        <div className="mt-2 px-4 pb-8">
          <p className="pt-4 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("general")}
          </p>
          <Row title={t("uiLanguage")} description={t("uiLanguageDescription")}>
            <PillGroup<UiLang>
              label=""
              value={prefs.uiLang}
              onChange={(v) => setPrefs({ uiLang: v })}
              options={[
                { value: "ja", label: "日本語" },
                { value: "en", label: "EN" },
                { value: "zh", label: "中文" },
              ]}
            />
          </Row>
          <Row title={t("theme")}>
            <PillGroup<Theme>
              label=""
              value={prefs.theme}
              onChange={(v) => setPrefs({ theme: v })}
              options={[
                { value: "system", label: t("system") },
                { value: "light", label: t("light") },
                { value: "dark", label: t("dark") },
              ]}
            />
          </Row>
          <Row title={t("launchAtLogin")}>
            <Switch
              checked={prefs.launchAtLogin}
              onCheckedChange={(v) => setPrefs({ launchAtLogin: v })}
            />
          </Row>

          <p className="pt-6 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("conversationSettings")}
          </p>
          {locked ? (
            <p className="mt-2 rounded-md bg-accent px-3 py-2 text-xs text-accent-foreground">
              {t("lockedWhileActive")}
            </p>
          ) : null}
          <Row title={t("conversationLanguage")}>
            <PillGroup<ConvLang>
              label=""
              disabled={locked}
              value={prefs.conversationLang}
              onChange={(v) => setPrefs({ conversationLang: v })}
              options={[
                { value: "ja", label: langLabel("ja", ui) },
                { value: "en", label: langLabel("en", ui) },
                { value: "zh", label: langLabel("zh", ui) },
              ]}
            />
          </Row>
          <Row title={t("level")}>
            <PillGroup<Level>
              label=""
              disabled={locked}
              value={prefs.level}
              onChange={(v) => setPrefs({ level: v })}
              options={[
                { value: "beginner", label: levelLabel("beginner", ui) },
                { value: "intermediate", label: levelLabel("intermediate", ui) },
                { value: "advanced", label: levelLabel("advanced", ui) },
              ]}
            />
          </Row>
          <Row title={t("audioSource")} description={t("headphonesHint")}>
            <PillGroup<AudioSource>
              label=""
              disabled={locked}
              value={prefs.audioSource}
              onChange={(v) => setPrefs({ audioSource: v })}
              options={[
                { value: "microphone", label: t("microphone") },
                { value: "system", label: t("systemAudio") },
                { value: "both", label: t("bothAudio") },
              ]}
            />
          </Row>
          <Row title={t("microphoneDevice")}>
            <span className="text-sm text-muted-foreground">{t("systemDefault")}</span>
          </Row>
          <Row title={t("defaultNetworkNode")} description={t("defaultNetworkNodeDescription")}>
            <PillGroup<NodeId>
              label=""
              disabled={locked}
              value={prefs.defaultNode}
              onChange={(v) => setPrefs({ defaultNode: v })}
              options={[
                { value: "local", label: t("localNode") },
                { value: "japan", label: t("japanNode") },
                { value: "relay", label: t("relayNode") },
              ]}
            />
          </Row>

          <p className="pt-6 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("voiceprint")}
          </p>
          <Row title={t("voiceprint")}>
            <span
              className={
                prefs.voiceprint
                  ? "rounded-full bg-accent px-3 py-1 text-xs font-semibold text-accent-foreground"
                  : "rounded-full bg-muted px-3 py-1 text-xs font-semibold text-muted-foreground"
              }
            >
              {prefs.voiceprint ? t("voiceprintReady") : t("voiceprintMissing")}
            </span>
          </Row>
          <Row title={t("deleteVoiceprint")} description={t("deleteVoiceprintDescription")} danger>
            <Button
              variant="soft"
              size="sm"
              disabled={locked || !prefs.voiceprint}
              onClick={() => setPrefs({ voiceprint: false })}
            >
              <Trash2 className="size-3.5" />
              {t("deleteVoiceprint")}
            </Button>
          </Row>

          <p className="pt-6 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("permissions")}
          </p>
          <Row title={t("microphonePermission")}>
            <span className="text-sm font-semibold text-muted-foreground">{t("granted")}</span>
          </Row>
          <Row title={t("screenPermission")}>
            <span className="text-sm font-semibold text-muted-foreground">
              {t("needsPermission")}
            </span>
          </Row>

          <p className="pt-6 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("dataPrivacy")}
          </p>
          <Row title={t("clearHistory")} description={t("clearHistoryDescription")} danger>
            <Button variant="soft" size="sm" onClick={clearHistory}>
              {t("clearHistory")}
            </Button>
          </Row>
          <Row title={t("resetPersonalData")} description={t("resetDescription")} danger>
            <Button variant="destructive" size="sm" onClick={reset}>
              {t("resetPersonalData")}
            </Button>
          </Row>

          <p className="pt-6 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("about")}
          </p>
          <Row title={t("version")}>
            <span className="text-sm text-muted-foreground">1.0.0</span>
          </Row>
        </div>
      </SheetContent>
    </Sheet>
  );
}
