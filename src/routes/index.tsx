import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KiboProvider, useKibo } from "@/lib/kibo/store";
import { Onboarding } from "@/components/kibo/onboarding";
import { SessionWorkbench } from "@/components/kibo/session-workbench";
import { AppBackground } from "@/components/kibo/app-background";
import { VoiceprintStep } from "@/components/kibo/voiceprint-step";
import { loadVoiceprint } from "@/lib/kibo/voiceprint";
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
          "Live transcription and AI reply suggestions for Japanese, English, and Chinese conversations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Page,
});

type Screen = "onboarding" | "voiceprint" | "session";

function App() {
  const { prefs, hydrated } = useKibo();
  const [screen, setScreen] = React.useState<Screen | null>(null);

  React.useEffect(() => {
    if (!hydrated || screen) return;
    if (!prefs.onboarded) setScreen("onboarding");
    else setScreen(loadVoiceprint() === null ? "voiceprint" : "session");
  }, [hydrated, prefs.onboarded, screen]);

  if (!hydrated || !screen) {
    return (
      <>
        <AppBackground />
        <div className="min-h-dvh" />
      </>
    );
  }

  if (screen === "session")
    return (
      <>
        <AppBackground />
        <SessionWorkbench />
      </>
    );

  return (
    <>
      <AppBackground />
      <main className="flex min-h-dvh items-center justify-center p-4">
        {screen === "onboarding" ? (
          <Onboarding onContinue={() => setScreen("voiceprint")} />
        ) : (
          <VoiceprintStep onContinue={() => setScreen("session")} />
        )}
      </main>
    </>
  );
}


function Page() {
  return (
    <KiboProvider>
      <App />
    </KiboProvider>
  );
}
