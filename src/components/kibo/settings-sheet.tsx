import * as React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { PillGroup } from "./pill-group";
import { useKibo, langLabel, levelLabel } from "@/lib/kibo/store";
import type {
  AudioSource,
  CaptureMode,
  ConvLang,
  DockStyle,
  Level,
  PanelLayout,
  UiLang,
} from "@/lib/kibo/types";

const translateCopy = {
  zh: { label: "翻译语言", hint: "把对方说的话翻译成这个语言显示" },
  ja: { label: "翻訳言語", hint: "相手の発話をこの言語に翻訳して表示します" },
  en: {
    label: "Translation language",
    hint: "Show the other person's lines translated into this language",
  },
} as const;

/**
 * Android Chrome (and iOS Safari) have no `getDisplayMedia`, so tab / system
 * audio capture is impossible there — hide those options instead of offering a
 * button that always fails.
 */
function useSystemAudioSupport() {
  const [supported, setSupported] = React.useState(true);
  React.useEffect(() => {
    setSupported(typeof navigator?.mediaDevices?.getDisplayMedia === "function");
  }, []);
  return supported;
}

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
    <div className="flex min-h-12 flex-col gap-2.5 border-b border-[oklch(35%_0.02_80_/_0.08)] py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className={danger ? "text-sm font-medium text-destructive" : "text-sm font-medium"}>
          {title}
        </p>
        {description ? <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      <div className="w-full min-w-0 sm:w-auto sm:shrink-0">{children}</div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <div className="px-0.5">
        <p className="text-[11px] font-medium tracking-[0.06em] text-muted-foreground/80 uppercase">
          {title}
        </p>
        {hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p> : null}
      </div>
      <div className="panel-sheet px-3 py-0.5 sm:px-3.5">{children}</div>
    </section>
  );
}

const glassSelectClass =
  "h-9 w-full min-w-0 rounded-md border border-[var(--glass-border)] bg-[oklch(100%_0_0_/_0.2)] px-3 text-sm backdrop-blur-sm sm:w-auto sm:min-w-48";

export function SettingsSheet({
  open,
  onOpenChange,
  locked,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locked: boolean;
}) {
  const { prefs, setPrefs, t, clearHistory, reset, history, user } = useKibo();
  const systemAudioSupported = useSystemAudioSupport();
  const [confirmClear, setConfirmClear] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  React.useEffect(() => {
    if (!systemAudioSupported && prefs.audioSource !== "microphone") {
      setPrefs({ audioSource: "microphone" });
    }
  }, [systemAudioSupported, prefs.audioSource, setPrefs]);
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

  const [newPassword, setNewPassword] = React.useState("");
  const [accountNote, setAccountNote] = React.useState("");
  const [dataNote, setDataNote] = React.useState("");

  const exportSessions = React.useCallback(() => {
    if (history.length === 0) {
      setDataNote(t("nothingToExport"));
      return;
    }
    const blob = new Blob([JSON.stringify(history, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kibotalk-sessions-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setDataNote(t("exported"));
  }, [history, t]);

  const savePassword = React.useCallback(async () => {
    if (newPassword.trim().length < 6) {
      setAccountNote(t("passwordTooShort"));
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword.trim() });
    setAccountNote(error ? error.message : t("passwordUpdated"));
    if (!error) setNewPassword("");
  }, [newPassword, t]);

  const signOutEverywhere = React.useCallback(async () => {
    await supabase.auth.signOut({ scope: "global" });
  }, []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b border-[oklch(35%_0.02_80_/_0.06)] px-5 pt-5 pr-14 pb-3">
          <SheetTitle className="font-display text-lg font-semibold tracking-tight">{t("settings")}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4 px-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <Section title={t("general")}>
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
          </Section>

          <Section title={t("conversationSettings")}>
            {locked ? (
              <p className="mt-2 mb-1 rounded-md border border-[oklch(100%_0_0_/_0.28)] bg-[oklch(100%_0_0_/_0.16)] px-3 py-2 text-[11px] text-foreground/75">
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
            <div className="flex flex-col gap-2 border-b border-[oklch(35%_0.02_80_/_0.08)] py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("audioSource")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("headphonesHint")}</p>
              </div>
              <PillGroup<AudioSource>
                label=""
                disabled={locked}
                value={prefs.audioSource}
                onChange={(v) => setPrefs({ audioSource: v })}
                options={[
                  {
                    value: "microphone" as AudioSource,
                    label: t("microphone"),
                    description: t("microphoneDescription"),
                  },
                  ...(systemAudioSupported
                    ? [
                        {
                          value: "system" as AudioSource,
                          label: t("systemAudio"),
                          description: t("systemAudioDescription"),
                        },
                        {
                          value: "both" as AudioSource,
                          label: t("bothAudio"),
                          description: t("bothAudioDescription"),
                        },
                      ]
                    : []),
                ]}
              />
            </div>
            <Row title={t("microphoneDevice")}>
              <select
                className={glassSelectClass}
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
            <div className="flex flex-col gap-2 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("captureMode")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("captureModeDescription")}</p>
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
          </Section>

          <Section title={t("display")}>
            <div className="flex flex-col gap-2 border-b border-[oklch(35%_0.02_80_/_0.08)] py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("panelLayout")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("panelLayoutDescription")}</p>
              </div>
              <PillGroup<PanelLayout>
                label=""
                value={prefs.panelLayout ?? "auto"}
                onChange={(v) => setPrefs({ panelLayout: v })}
                options={[
                  {
                    value: "auto",
                    label: t("layoutAuto"),
                    description: t("layoutAutoDescription"),
                  },
                  {
                    value: "row",
                    label: t("layoutRow"),
                    description: t("layoutRowDescription"),
                  },
                  {
                    value: "column",
                    label: t("layoutColumn"),
                    description: t("layoutColumnDescription"),
                  },
                ]}
              />
            </div>
            <div className="flex flex-col gap-2 border-b border-[oklch(35%_0.02_80_/_0.08)] py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("scrollSync")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("scrollSyncDescription")}</p>
              </div>
              <PillGroup<"linked" | "independent">
                label=""
                value={prefs.scrollSync ?? "independent"}
                onChange={(v) => setPrefs({ scrollSync: v })}
                options={[
                  {
                    value: "independent",
                    label: t("scrollIndependent"),
                    description: t("scrollIndependentDescription"),
                  },
                  {
                    value: "linked",
                    label: t("scrollLinked"),
                    description: t("scrollLinkedDescription"),
                  },
                ]}
              />
            </div>

            {/* Phone-only: how the hold-to-talk dock sits at the bottom. */}
            <div className="flex flex-col gap-3 border-b border-[oklch(35%_0.02_80_/_0.08)] py-3 sm:hidden">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("mobileDock")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{t("mobileDockDescription")}</p>
              </div>
              <PillGroup<DockStyle>
                label=""
                value={prefs.dockStyle ?? "float"}
                onChange={(v) => setPrefs({ dockStyle: v })}
                options={[
                  {
                    value: "float",
                    label: t("dockFloat"),
                    description: t("dockFloatDescription"),
                  },
                  { value: "bar", label: t("dockBar"), description: t("dockBarDescription") },
                ]}
              />
              <div className="flex items-center gap-3">
                <span className="w-14 shrink-0 text-xs font-medium text-foreground/80">
                  {t("dockSize")}
                </span>
                <Slider
                  className="min-w-0 flex-1"
                  min={0.8}
                  max={1.3}
                  step={0.05}
                  value={[prefs.dockScale ?? 1]}
                  onValueChange={([v]: number[]) => setPrefs({ dockScale: v ?? 1 })}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round((prefs.dockScale ?? 1) * 100)}%
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{t("dockSizeDescription")}</p>
            </div>

            <div className="flex flex-col gap-3 py-3.5">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t("suggestionFontSize")}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {t("suggestionFontSizeDescription")}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Slider
                  className="min-w-0 flex-1"
                  min={0.75}
                  max={1.5}
                  step={0.05}
                  value={[prefs.suggestionFontScale]}
                  onValueChange={([v]: number[]) => setPrefs({ suggestionFontScale: v ?? 1 })}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round((prefs.suggestionFontScale ?? 1) * 100)}%
                </span>
              </div>
              <Button
                variant="soft"
                size="sm"
                className="self-start rounded-md"
                onClick={() => setPrefs({ suggestionFontScale: 1 })}
              >
                {t("resetTypography")}
              </Button>
            </div>
          </Section>

          <Section title={t("features")} hint={t("featuresDescription")}>
            <Row title={t("autoSuggest")} description={t("autoSuggestDescription")}>
              <Switch
                checked={prefs.autoSuggest !== false}
                onCheckedChange={(v) => setPrefs({ autoSuggest: v })}
              />
            </Row>
            <Row title={t("hapticsEnabled")} description={t("hapticsEnabledDescription")}>
              <Switch
                checked={prefs.hapticsEnabled !== false}
                onCheckedChange={(v) => setPrefs({ hapticsEnabled: v })}
              />
            </Row>
            <Row title={t("showVadDiagnostics")} description={t("showVadDiagnosticsDescription")}>
              <Switch
                checked={!!prefs.showVadDiagnostics}
                onCheckedChange={(v) => setPrefs({ showVadDiagnostics: v })}
              />
            </Row>
          </Section>

          <Section title={t("permissions")}>
            <Row title={t("microphonePermission")}>
              {micPermission === "granted" ? (
                <span className="text-sm font-medium text-muted-foreground">{t("granted")}</span>
              ) : (
                <Button variant="soft" size="sm" className="rounded-md" onClick={() => void requestMic()}>
                  {t("requestPermission")}
                </Button>
              )}
            </Row>
            <Row
              title={t("screenPermission")}
              description={
                !systemAudioSupported
                  ? t("screenPermissionUnsupported")
                  : prefs.audioSource === "microphone"
                    ? t("screenPermissionNotNeeded")
                    : t("headphonesHint")
              }
            >
              <span className="max-w-48 text-right text-sm font-medium text-muted-foreground">
                {!systemAudioSupported
                  ? t("screenPermissionUnsupported")
                  : prefs.audioSource === "microphone"
                    ? t("screenPermissionNotNeeded")
                    : t("screenPermissionOnStart")}
              </span>
            </Row>
          </Section>

          <Section title={t("personalization")}>
            <Row title={t("useProfileContext")} description={t("useProfileContextDescription")}>
              <Switch
                checked={prefs.useProfileContext}
                onCheckedChange={(v) => setPrefs({ useProfileContext: v })}
              />
            </Row>
            <Row title={t("useMemoryContext")} description={t("useMemoryContextDescription")}>
              <Switch
                checked={prefs.useMemoryContext}
                onCheckedChange={(v) => setPrefs({ useMemoryContext: v })}
              />
            </Row>
            <Row title={t("manageMemory")} description={t("memoryEntryHint")}>
              <Button variant="soft" size="sm" className="rounded-md" asChild>
                <Link to="/memory" onClick={() => onOpenChange(false)}>
                  {t("openMemory")}
                </Link>
              </Button>
            </Row>
          </Section>

          <Section title={t("accountSecurity")}>
            <Row title={t("signedInAs")}>
              <span className="text-sm break-all text-muted-foreground">
                {user?.email ?? t("notSignedIn")}
              </span>
            </Row>
            <Row title={t("changePassword")} description={t("changePasswordDescription")}>
              <div className="flex w-full gap-2 sm:w-72">
                <Input
                  type="password"
                  autoComplete="new-password"
                  placeholder={t("newPassword")}
                  value={newPassword}
                  disabled={!user}
                  className="rounded-md border-[oklch(100%_0_0_/_0.28)] bg-[oklch(100%_0_0_/_0.18)]"
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button
                  variant="soft"
                  size="sm"
                  className="rounded-md"
                  disabled={!user}
                  onClick={() => void savePassword()}
                >
                  {t("save")}
                </Button>
              </div>
            </Row>
            {accountNote ? (
              <p className="-mt-1 pb-2 text-xs text-muted-foreground">{accountNote}</p>
            ) : null}
            <Row title={t("signOutAll")} description={t("signOutAllDescription")}>
              <Button
                variant="soft"
                size="sm"
                className="rounded-md"
                disabled={!user}
                onClick={() => void signOutEverywhere()}
              >
                {t("signOutAllAction")}
              </Button>
            </Row>
          </Section>

          <Section title={t("dataPrivacy")}>
            <Row title={t("exportData")} description={t("exportDataDescription")}>
              <Button variant="soft" size="sm" className="rounded-md" onClick={exportSessions}>
                {t("exportAction")}
              </Button>
            </Row>
            {dataNote ? <p className="-mt-1 pb-2 text-xs text-muted-foreground">{dataNote}</p> : null}
            <Row title={t("clearHistory")} description={t("clearHistoryDescription")} danger>
              <Button
                variant="soft"
                size="sm"
                className="rounded-md"
                onClick={() => setConfirmClear(true)}
              >
                {t("clearHistory")}
              </Button>
            </Row>
            <Row title={t("resetPersonalData")} description={t("resetDescription")} danger>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-md"
                onClick={() => setConfirmReset(true)}
              >
                {t("resetPersonalData")}
              </Button>
            </Row>
          </Section>

          <Section title={t("about")}>
            <Row title={t("version")}>
              <span className="text-sm text-muted-foreground">1.0.0</span>
            </Row>
          </Section>
        </div>
      </SheetContent>

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("clearHistoryTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("clearHistoryDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearHistory();
                setConfirmClear(false);
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("resetTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("resetDescription")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                reset();
                setConfirmReset(false);
              }}
            >
              {t("confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
