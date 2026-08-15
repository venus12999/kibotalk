import { createFileRoute } from "@tanstack/react-router";
import { KiboProvider } from "@/lib/kibo/store";
import { LandingPage } from "@/components/kibo/landing-page";

export const Route = createFileRoute("/download")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Download KiboTalk" },
      {
        name: "description",
        content:
          "Download the KiboTalk desktop app, or use live captions and three reply suggestions in the browser.",
      },
      { property: "og:title", content: "Download KiboTalk" },
      {
        property: "og:description",
        content: "Closed-beta desktop app and browser access for KiboTalk.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  component: Page,
});

function Page() {
  return (
    <KiboProvider>
      <LandingPage />
    </KiboProvider>
  );
}
