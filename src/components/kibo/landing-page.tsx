import { Link } from "@tanstack/react-router";
import {
  Apple,
  ArrowRight,
  AudioLines,
  Brain,
  Download,
  MessageSquareText,
  Monitor,
} from "lucide-react";
import logoAsset from "@/assets/kibotalk-logo.png.asset.json";
import { AppBackground } from "@/components/kibo/app-background";
import { UiLanguageMenu } from "@/components/kibo/ui-language-menu";
import { VoiceCloud } from "@/components/kibo/voice-cloud";
import { Button } from "@/components/ui/button";
import {
  DESKTOP_DOWNLOADS,
  DESKTOP_FILES,
  detectDesktopPlatform,
  isKiboTalkDesktop,
} from "@/lib/kibo/desktop";
import { useKibo } from "@/lib/kibo/store";
import { useSession } from "@/lib/kibo/use-session";

export function LandingPage() {
  const { t } = useKibo();
  const { user } = useSession();
  const inDesktop = isKiboTalkDesktop();
  const platform = detectDesktopPlatform();
  const onComputer = platform !== "other";
  const primaryHref =
    platform === "windows"
      ? DESKTOP_DOWNLOADS.windows
      : platform === "mac-intel"
        ? DESKTOP_DOWNLOADS.macIntel
        : platform === "mac-arm"
          ? DESKTOP_DOWNLOADS.macArm
          : "";
  const primaryFile =
    platform === "windows"
      ? DESKTOP_FILES.windows
      : platform === "mac-intel"
        ? DESKTOP_FILES.macIntel
        : DESKTOP_FILES.macArm;
  const primaryLabel = platform === "windows" ? t("landingDownloadWin") : t("landingDownloadMac");

  const features = [
    { icon: AudioLines, title: t("landingFeatureListen"), hint: t("landingFeatureListenHint") },
    {
      icon: MessageSquareText,
      title: t("landingFeatureReply"),
      hint: t("landingFeatureReplyHint"),
    },
    { icon: Brain, title: t("landingFeatureMemory"), hint: t("landingFeatureMemoryHint") },
  ] as const;

  const steps = [t("landingHow1"), t("landingHow2"), t("landingHow3")];

  return (
    <div
      className="relative min-h-dvh"
      style={{
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))",
      }}
    >
      <AppBackground />
      <div className="mx-auto flex w-full max-w-5xl flex-col px-4 sm:px-6">
        <header className="flex items-center justify-between gap-3 py-2">
          <img
            src={logoAsset.url}
            alt={t("appName")}
            className="h-10 w-auto select-none sm:h-11"
            draggable={false}
          />
          <div className="flex items-center gap-2">
            <UiLanguageMenu compact />
            {user ? (
              <Button asChild size="sm">
                <Link to="/">{t("landingOpenApp")}</Link>
              </Button>
            ) : (
              <Button asChild size="sm" variant="outline">
                <Link to="/auth">{t("landingSignIn")}</Link>
              </Button>
            )}
          </div>
        </header>

        <main className="sheet-enter flex flex-1 flex-col items-center pb-10 pt-6 text-center sm:pt-10">
          <p className="glass-chip rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide text-muted-foreground">
            {t("landingBeta")}
          </p>
          <h1 className="font-display mt-4 max-w-xl text-[1.85rem] leading-tight font-bold tracking-tight text-foreground sm:text-4xl">
            {t("landingHeadline")}
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("landingLead")}
          </p>

          <div className="home-orb-wrap mt-6">
            <VoiceCloud size="lg" />
          </div>

          <div className="mt-6 flex w-full max-w-md flex-col items-stretch gap-3">
            {inDesktop ? (
              <>
                <p className="text-sm text-muted-foreground">{t("landingDesktopReady")}</p>
                <Button asChild size="lg">
                  <Link to="/auth">
                    {t("landingSignIn")}
                    <ArrowRight />
                  </Link>
                </Button>
              </>
            ) : (
              <>
                {onComputer && primaryHref ? (
                  <a
                    href={primaryHref}
                    download={primaryFile}
                    className="home-pill-cta landing-download-cta group"
                  >
                    <span className="home-pill-cta-icon">
                      <Download className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1 text-center text-sm font-semibold">
                      {primaryLabel}
                    </span>
                    <span className="size-[2.35rem] shrink-0" aria-hidden />
                  </a>
                ) : (
                  <p className="text-sm text-muted-foreground">{t("landingUseOnPhone")}</p>
                )}
                <Button asChild size="lg" variant={onComputer ? "outline" : "default"}>
                  <Link to="/auth">
                    {t("landingOpenBrowser")}
                    <ArrowRight />
                  </Link>
                </Button>
                <p className="text-[11px] font-medium text-muted-foreground">
                  {t("landingComputerDownloads")}
                </p>
                <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
                  <a
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    href={DESKTOP_DOWNLOADS.macArm}
                    download={DESKTOP_FILES.macArm}
                  >
                    <Apple className="size-3" />
                    {t("landingDownloadMac")}
                  </a>
                  <a
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    href={DESKTOP_DOWNLOADS.macIntel}
                    download={DESKTOP_FILES.macIntel}
                  >
                    <Apple className="size-3" />
                    {t("landingDownloadMacIntel")}
                  </a>
                  <a
                    className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
                    href={DESKTOP_DOWNLOADS.windows}
                    download={DESKTOP_FILES.windows}
                  >
                    <Monitor className="size-3" />
                    {t("landingDownloadWin")}
                  </a>
                </div>
              </>
            )}
          </div>

          <section className="mt-12 grid w-full gap-3 sm:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="paper-sheet px-4 py-5 text-left">
                <feature.icon className="size-5 text-accent-foreground" strokeWidth={1.75} />
                <h2 className="font-display mt-3 text-base font-semibold">{feature.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {feature.hint}
                </p>
              </div>
            ))}
          </section>

          <section className="paper-sheet mt-6 w-full px-4 py-5 text-left sm:px-6">
            <h2 className="font-display text-base font-semibold">{t("landingHowTitle")}</h2>
            <ol className="mt-3 space-y-2">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-foreground">
                  <span className="gradient-primary mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-primary-foreground">
                    {index + 1}
                  </span>
                  <span className="leading-relaxed">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {!inDesktop ? (
            <p className="mt-6 max-w-xl text-left text-xs leading-relaxed text-muted-foreground">
              {platform === "windows" ? t("landingWinNote") : t("landingMacNote")}{" "}
              {t("landingBetaNote")}
            </p>
          ) : (
            <p className="mt-6 max-w-xl text-left text-xs leading-relaxed text-muted-foreground">
              {t("landingBetaNote")}
            </p>
          )}
        </main>
      </div>
    </div>
  );
}
