import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Brain } from "lucide-react";
import { AppBackground } from "@/components/kibo/app-background";
import { MemoryPanel } from "@/components/kibo/memory-panel";
import { Button } from "@/components/ui/button";
import { KiboProvider } from "@/lib/kibo/store";

export const Route = createFileRoute("/_authenticated/memory")({
  head: () => ({
    meta: [
      { title: "Kibo 记忆 · 让 AI 记住你的信息" },
      {
        name: "description",
        content: "保存你的身份、偏好、人际关系和目标，Kibo 在给出回复思路时会一直记得这些内容。",
      },
      { property: "og:title", content: "Kibo 记忆" },
      {
        property: "og:description",
        content: "跨会话保存的个人资料与记忆条目，让实时回复建议更贴近你本人。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MemoryRoute,
});

function MemoryRoute() {
  return (
    <KiboProvider>
      <MemoryPage />
    </KiboProvider>
  );
}

function MemoryPage() {
  return (
    <>
      <AppBackground pale />
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-5 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
        <header className="glass-bar flex items-center gap-3 rounded-[1.75rem] px-3 py-2.5">
          <Button variant="soft" size="icon" className="rounded-full" asChild aria-label="返回">
            <Link to="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <span className="home-hub-tint flex size-9 shrink-0 items-center justify-center rounded-xl">
            <Brain className="size-4" strokeWidth={1.75} />
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-base font-bold tracking-tight">Kibo 记忆</h1>
            <p className="truncate text-xs text-muted-foreground">
              这些内容会在每次生成回复思路时被参考
            </p>
          </div>
        </header>
        <MemoryPanel />
      </main>
    </>
  );
}
