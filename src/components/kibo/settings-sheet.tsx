import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { PillGroup } from "./pill-group";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import type { AudioSource, CaptureMode, ConvLang, Level, PanelLayout, Theme, UiLang } from "@/lib/kibo/types";

const translateCopy = {
  zh: { label: "翻译语言", hint: "把对方说的话翻译成这个语言显示" },
  ja: { label: "翻訳言語", hint: "相手の発話をこの言語に翻訳して表示します" },
  en: {
    label: "Translation language",
    hint: "Show the other person's lines translated into this language",
  },
} as const;

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
      <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{children}</div>

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

  const [mics, setMics] = React.useState<MediaDeviceInfo[]>([]);
  const [micPermission, setMicPermission] = React.useState<PermissionState | "unknown">("unknown");

  const refreshDevices = React.useCallback(async () => {
    const all = await navigator.mediaDevices?.enumerateDevices().catch(() => []);
    const inputs = (all ?? []).filter((d) => d.kind === "audioinput");
    // Before permission is granted browsers expose placeholder entries with empty
    // labels (and often several per physical mic). Showing them produced the
    // bogus "Microphone 1/2/3" list, so keep only real, de-duplicated devices.
    const seen = new Set<string>();
    setMics(
      inputs.filter((d) => {
        if (!d.label || d.deviceId === "default" || d.deviceId === "communications") return false;
        const key = d.groupId || d.label;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  }, []);


  React.useEffect(() => {
    if (!open) return;
    void refreshDevices();
    let status: PermissionStatus | null = null;
    const onChange = () => setMicPermission(status?.state ?? "unknown");
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((s) => {
        status = s;
        onChange();
        s.addEventListener("change", onChange);
      })
      .catch(() => setMicPermission("unknown"));
    return () => status?.removeEventListener("change", onChange);
  }, [open, refreshDevices]);

  const requestMic = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((tr) => tr.stop());
      setMicPermission("granted");
      await refreshDevices();
    } catch {
      setMicPermission("denied");
    }
  }, [refreshDevices]);

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
          <Row title={translateCopy[ui].label} description={translateCopy[ui].hint}>
            <PillGroup<ConvLang>
              label=""
              value={prefs.translateLang}
              onChange={(v) => setPrefs({ translateLang: v })}
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
          <div className="flex flex-col gap-2 border-b border-border py-4">
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("audioSource")}</p>
                <p className="mt-0.5 text-xs text-foreground/70">{t("headphonesHint")}</p>
              </div>
            </div>
            <PillGroup<AudioSource>
              label=""
              disabled={locked}
              value={prefs.audioSource}
              onChange={(v) => setPrefs({ audioSource: v })}
              options={[
                { value: "microphone", label: t("microphone"), description: t("microphoneDescription") },
                { value: "system", label: t("systemAudio"), description: t("systemAudioDescription") },
                { value: "both", label: t("bothAudio"), description: t("bothAudioDescription") },
              ]}
            />
          </div>
          <Row title={t("microphoneDevice")}>
            <select
              className="h-9 w-full min-w-0 rounded-md border border-border bg-background px-2 text-sm sm:w-auto sm:min-w-48"
              disabled={locked}
              value={prefs.micDeviceId}
              onChange={(e) => setPrefs({ micDeviceId: e.target.value })}
            >
              <option value="">{t("systemDefault")}</option>
              {mics.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>
                  {d.label}
                </option>
              ))}
            </select>
          </Row>
          <div className="flex flex-col gap-2 border-b border-border py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t("captureMode")}</p>
              <p className="mt-0.5 text-xs text-foreground/70">{t("captureModeDescription")}</p>
            </div>
            <PillGroup<CaptureMode>
              label=""
              disabled={locked}
              value={prefs.captureMode}
              onChange={(v) => setPrefs({ captureMode: v })}
              options={[
                { value: "push", label: t("pushMode"), description: t("pushModeDescription") },
                {
                  value: "continuous",
                  label: t("continuousMode"),
                  description: t("continuousModeDescription"),
                },
              ]}
            />
          </div>
          <div className="flex flex-col gap-2 border-b border-border py-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{t("panelLayout")}</p>
              <p className="mt-0.5 text-xs text-foreground/70">{t("panelLayoutDescription")}</p>
            </div>
            <PillGroup<PanelLayout>
              label=""
              value={prefs.panelLayout ?? "auto"}
              onChange={(v) => setPrefs({ panelLayout: v })}
              options={[
                { value: "auto", label: t("layoutAuto"), description: t("layoutAutoDescription") },
                { value: "row", label: t("layoutRow"), description: t("layoutRowDescription") },
                {
                  value: "column",
                  label: t("layoutColumn"),
                  description: t("layoutColumnDescription"),
                },
              ]}
            />
          </div>
          {(prefs.panelLayout ?? "auto") === "row" ? (
            <div className="flex flex-col gap-3 border-b border-border py-4">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t("rowTypography")}</p>
                <p className="mt-0.5 text-xs text-foreground/70">{t("rowTypographyDescription")}</p>
              </div>
              {(
                [
                  ["fontScale", "rowFontScale", 0.8, 1.4] as const,
                  ["lineScale", "rowLineScale", 0.85, 1.6] as const,
                  ["gapScale", "rowGapScale", 0.6, 1.6] as const,
                ] as const
              ).map(([labelKey, key, min, max]) => {
                const value = (prefs[key] as number | undefined) ?? 1;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <span className="w-14 shrink-0 text-xs font-semibold text-foreground/80">
                      {t(labelKey)}
                    </span>
                    <Slider
                      className="min-w-0 flex-1"
                      min={min}
                      max={max}
                      step={0.05}
                      value={[value]}
                      onValueChange={([v]: number[]) => setPrefs({ [key]: v ?? 1 } as Partial<typeof prefs>)}
                    />
                    <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                      {Math.round(value * 100)}%
                    </span>
                  </div>
                );
              })}
              <Button
                variant="soft"
                size="sm"
                className="self-start"
                onClick={() => setPrefs({ rowFontScale: 1, rowLineScale: 1, rowGapScale: 1 })}
              >
                {t("resetTypography")}
              </Button>
            </div>
          ) : null}





          <p className="pt-6 text-xs font-bold tracking-wide text-muted-foreground uppercase">
            {t("permissions")}
          </p>
          <Row title={t("microphonePermission")}>
            {micPermission === "granted" ? (
              <span className="text-sm font-semibold text-muted-foreground">{t("granted")}</span>
            ) : (
              <Button variant="soft" size="sm" onClick={() => void requestMic()}>
                {t("requestPermission")}
              </Button>
            )}
          </Row>
          <Row title={t("screenPermission")} description={t("headphonesHint")}>
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
