import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Brain, Loader2, Pin, PinOff, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppBackground } from "@/components/kibo/app-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { KiboProvider, useKibo } from "@/lib/kibo/store";
import { useSession } from "@/lib/kibo/use-session";
import {
  MEMORY_KINDS,
  addMemory,
  deleteMemory,
  listMemories,
  updateMemory,
  type MemoryItem,
  type MemoryKind,
} from "@/lib/kibo/memory";

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

const KIND_LABEL: Record<MemoryKind, string> = {
  profile: "身份",
  preference: "偏好",
  relationship: "关系",
  goal: "目标",
  other: "其他",
};

function MemoryRoute() {
  return (
    <KiboProvider>
      <MemoryPage />
    </KiboProvider>
  );
}

function MemoryPage() {
  const { user } = useSession();
  const { prefs, setPrefs } = useKibo();
  const userId = user?.id ?? null;

  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const [kind, setKind] = React.useState<MemoryKind>("profile");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setLoading(true);
    listMemories(userId)
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => toast.error("记忆加载失败"))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const create = async () => {
    const content = draft.trim();
    if (!userId || !content) return;
    setSaving(true);
    try {
      const row = await addMemory(userId, { content, kind });
      setItems((prev) => [row, ...prev]);
      setDraft("");
      toast.success("已记住");
    } catch {
      toast.error("保存失败");
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (item: MemoryItem) => {
    setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, pinned: !m.pinned } : m)));
    try {
      await updateMemory(item.id, { pinned: !item.pinned });
    } catch {
      toast.error("操作失败");
    }
  };

  const remove = async (item: MemoryItem) => {
    setItems((prev) => prev.filter((m) => m.id !== item.id));
    try {
      await deleteMemory(item.id);
    } catch {
      toast.error("删除失败");
    }
  };

  return (
    <>
      <AppBackground />
      <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-4 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-5">
        <header className="glass-bar flex items-center gap-3 rounded-2xl px-3 py-2.5">
          <Button variant="soft" size="icon" asChild aria-label="返回">
            <Link to="/">
              <ArrowLeft className="size-4" />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-bold tracking-tight">
              <Brain className="size-4 text-primary" /> Kibo 记忆
            </h1>
            <p className="truncate text-xs text-muted-foreground">
              这些内容会在每次生成回复思路时被参考
            </p>
          </div>
        </header>


        <section className="paper-sheet space-y-3 rounded-2xl p-4">
          <h2 className="text-sm font-semibold">我的资料</h2>
          <div className="space-y-2">
            <Input
              value={prefs.profileName}
              maxLength={40}
              placeholder="怎么称呼你"
              onChange={(e) => setPrefs({ profileName: e.target.value })}
            />
            <Textarea
              value={prefs.profileAbout}
              maxLength={300}
              rows={3}
              placeholder="简单介绍你自己：职业、性格、说话风格…"
              onChange={(e) => setPrefs({ profileAbout: e.target.value })}
            />
            <Textarea
              value={prefs.profileGoal}
              maxLength={300}
              rows={2}
              placeholder="你希望在对话里达成什么？例如：交朋友、面试、谈业务"
              onChange={(e) => setPrefs({ profileGoal: e.target.value })}
            />
          </div>
          <p className="text-xs text-muted-foreground">资料会随账号云同步，随时可改。</p>
        </section>

        <section className="paper-sheet space-y-3 rounded-2xl p-4">
          <h2 className="text-sm font-semibold">添加一条记忆</h2>
          <div className="flex flex-wrap gap-1.5">
            {MEMORY_KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "soft"}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
          <Textarea
            value={draft}
            rows={2}
            maxLength={500}
            placeholder="例如：我在东京做设计，喜欢直接但礼貌的说话方式"
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button
            className="w-full gap-2"
            disabled={!draft.trim() || saving}
            onClick={() => void create()}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            记住这条
          </Button>
        </section>

        <section className="paper-sheet space-y-2 rounded-2xl p-4">
          <h2 className="text-sm font-semibold">已记住 ({items.length})</h2>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">还没有记忆条目。</p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start gap-2 rounded-xl bg-background/40 px-3 py-2"
                >
                  <span className="mt-0.5 shrink-0 rounded-full bg-primary/20 px-2 py-0.5 text-[11px] text-foreground/80">
                    {KIND_LABEL[m.kind]}
                  </span>
                  <p className="min-w-0 flex-1 text-sm break-words">{m.content}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={m.pinned ? "取消置顶" : "置顶"}
                    onClick={() => void togglePin(m)}
                  >
                    {m.pinned ? (
                      <Pin className="size-4 text-primary" />
                    ) : (
                      <PinOff className="size-4 opacity-60" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="删除"
                    onClick={() => void remove(m)}
                  >
                    <Trash2 className="size-4 opacity-70" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}

