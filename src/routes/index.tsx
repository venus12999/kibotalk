import * as React from "react";
import { createFileRoute } from "@tanstack/react-router";
import { KiboProvider, useKibo } from "@/lib/kibo/store";
import { Onboarding } from "@/components/kibo/onboarding";
import { SessionWorkbench } from "@/components/kibo/session-workbench";

export const Route = createFileRoute("/")({
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
          "Live transcription and AI reply suggestions for Japanese, English, and Chinese conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Screen = "onboarding" | "session";

function App() {
  const { prefs, hydrated } = useKibo();
  const [screen, setScreen] = React.useState<Screen | null>(null);

  React.useEffect(() => {
    if (!hydrated || screen) return;
    setScreen(prefs.onboarded ? "session" : "onboarding");
  }, [hydrated, prefs.onboarded, screen]);

  if (!hydrated || !screen) {
    return <div className="min-h-dvh bg-background" />;
  }

  if (screen === "session") return <SessionWorkbench />;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-4">
      <Onboarding onContinue={() => setScreen("session")} />
    </main>
  );
}

function Page() {
  return (
    <KiboProvider>
      <App />
    </KiboProvider>
  );
}
