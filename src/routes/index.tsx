import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KiboProvider, useKibo } from "@/lib/kibo/store";
import { AppBackground } from "@/components/kibo/app-background";
import { DesktopApp } from "@/components/kibo/desktop-app";
import { LandingPage } from "@/components/kibo/landing-page";
import { useSession } from "@/lib/kibo/use-session";

export const Route = createFileRoute("/")({
  ssr: false,

  head: () => ({
    meta: [
      { title: "KiboTalk — Real-time conversation coach" },
      {
        name: "description",
        content:
          "KiboTalk listens to your conversation, transcribes it live, and suggests natural replies in Japanese, English, or Chinese.",
      },
      { property: "og:title", content: "KiboTalk — Real-time conversation coach" },
      {
        property: "og:description",
        content:
          "Live transcription and AI reply suggestions for Japanese, English, or Chinese conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Screen = "onboarding" | "home" | "session";

function App() {
  const { prefs, hydrated } = useKibo();
  const { user, loading: authLoading } = useSession();
  const [screen, setScreen] = React.useState<Screen | null>(null);

  React.useEffect(() => {
    if (!hydrated || screen) return;
    setScreen(prefs.onboarded ? "home" : "onboarding");
  }, [hydrated, prefs.onboarded, screen]);

  if (authLoading) {
    return (
      <>
        <AppBackground />
        <div className="flex min-h-dvh items-center justify-center">
          <div className="sheet-enter flex flex-col items-center gap-3">
            <span
              aria-hidden
              className="brand-breathe gradient-primary glow size-14 rounded-full"
            />
            <p className="font-display text-sm font-semibold tracking-tight text-foreground/80">
              KiboTalk
            </p>
          </div>
        </div>
      </>
    );
  }

  if (!user) return <LandingPage />;

  if (!hydrated || !screen) {
    return (
      <>
        <AppBackground />
        <div className="flex min-h-dvh items-center justify-center">
          <div className="sheet-enter flex flex-col items-center gap-3">
            <span
              aria-hidden
              className="brand-breathe gradient-primary glow size-14 rounded-full"
            />
            <p className="font-display text-sm font-semibold tracking-tight text-foreground/80">
              KiboTalk
            </p>
          </div>
        </div>
      </>
    );
  }

  return <DesktopApp screen={screen} setScreen={setScreen} />;
}

function Page() {
  return (
    <KiboProvider>
      <App />
    </KiboProvider>
  );
}
