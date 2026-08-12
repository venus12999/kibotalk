import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Brain, ImagePlus, Loader2, Pin, PinOff, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppBackground } from "@/components/kibo/app-background";
import { ProfileCard } from "@/components/kibo/profile-card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { KiboProvider } from "@/lib/kibo/store";
import { useSession } from "@/lib/kibo/use-session";
import {
  MEMORY_KINDS,
  addMemory,
  deleteMemoryItem,
  getSignedImageUrl,
  listMemories,
  updateMemory,
  uploadMemoryImage,
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

function MemoryImage({ path, alt }: { path: string; alt: string }) {
  const [url, setUrl] = React.useState<string | null>(null);
  React.useEffect(() => {
    let cancelled = false;
    getSignedImageUrl(path, 3600)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [path]);
  if (!url) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-quiet)] backdrop-blur-md">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      className="max-h-48 w-full rounded-2xl border border-[var(--glass-border)] bg-[var(--glass-quiet)] object-contain"
    />
  );
}

function MemoryPage() {
  const { user } = useSession();
  const userId = user?.id ?? null;

  const [items, setItems] = React.useState<MemoryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [draft, setDraft] = React.useState("");
  const [kind, setKind] = React.useState<MemoryKind>("profile");
  const [saving, setSaving] = React.useState(false);

  const [pendingImageFile, setPendingImageFile] = React.useState<File | null>(null);
  const [pendingImagePreview, setPendingImagePreview] = React.useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

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

  React.useEffect(() => {
    return () => {
      if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    };
  }, [pendingImagePreview]);

  const create = async () => {
    const content = draft.trim();
    if (!userId || !content) return;
    setSaving(true);
    try {
      let imageUrl: string | null = null;
      if (pendingImageFile) {
        setUploadingImage(true);
        imageUrl = await uploadMemoryImage(userId, pendingImageFile);
        setUploadingImage(false);
      }
      const row = await addMemory(userId, { content, kind, imageUrl });
      setItems((prev) => [row, ...prev]);
      setDraft("");
      setPendingImageFile(null);
      setPendingImagePreview(null);
      toast.success("已记住");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setSaving(false);
      setUploadingImage(false);
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

  const removeImage = async (item: MemoryItem) => {
    if (!item.imageUrl) return;
    try {
      const { deleteStorageObject } = await import("@/lib/kibo/memory");
      await deleteStorageObject(item.imageUrl);
      await updateMemory(item.id, { imageUrl: null });
      setItems((prev) => prev.map((m) => (m.id === item.id ? { ...m, imageUrl: null } : m)));
      toast.success("图片已移除");
    } catch {
      toast.error("移除图片失败");
    }
  };

  const remove = async (item: MemoryItem) => {
    setItems((prev) => prev.filter((m) => m.id !== item.id));
    try {
      await deleteMemoryItem(item);
    } catch {
      toast.error("删除失败");
    }
  };

  const onSelectImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("请选择图片文件");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      toast.error("图片大小不能超过 4MB");
      return;
    }
    if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
    setPendingImageFile(file);
    setPendingImagePreview(URL.createObjectURL(file));
  };

  const busy = saving || uploadingImage;

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

        <ProfileCard />

        <section className="orb-sheet space-y-3.5 p-4 sm:p-5">
          <h2 className="font-display text-sm font-semibold tracking-tight">添加一条记忆</h2>
          <div className="flex flex-wrap gap-1.5">
            {MEMORY_KINDS.map((k) => (
              <Button
                key={k}
                type="button"
                size="sm"
                variant={kind === k ? "default" : "soft"}
                className="rounded-full"
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </Button>
            ))}
          </div>
          <Textarea
            value={draft}
            rows={3}
            maxLength={500}
            placeholder="写一件想让 Kibo 记住的事…"
            className="rounded-2xl border-[var(--glass-border)] bg-[var(--glass-quiet)] backdrop-blur-md"
            onChange={(e) => setDraft(e.target.value)}
          />
          {pendingImagePreview && (
            <div className="relative w-fit max-w-full">
              <img
                src={pendingImagePreview}
                alt="待上传图片"
                className="max-h-40 rounded-2xl border border-[var(--glass-border)] object-contain"
              />
              <button
                type="button"
                onClick={() => {
                  if (pendingImagePreview) URL.revokeObjectURL(pendingImagePreview);
                  setPendingImageFile(null);
                  setPendingImagePreview(null);
                }}
                className="absolute -right-2 -top-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-strong)] p-1 text-foreground shadow-md backdrop-blur-md"
                aria-label="移除图片"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => onSelectImage(e.target.files?.[0] ?? null)}
            />
            <Button
              type="button"
              variant="soft"
              size="sm"
              className="gap-1.5 rounded-full"
              disabled={busy}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingImage ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ImagePlus className="size-4" />
              )}
              {uploadingImage ? "上传中" : pendingImageFile ? "更换图片" : "添加图片"}
            </Button>
            <Button
              className="ml-auto w-full max-w-[12rem] gap-2 rounded-full"
              disabled={!draft.trim() || busy}
              onClick={() => void create()}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              记住这条
            </Button>
          </div>
        </section>

        <section className="orb-sheet space-y-3 p-4 sm:p-5">
          <h2 className="font-display text-sm font-semibold tracking-tight">
            已记住 ({items.length})
          </h2>
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> 加载中…
            </div>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">还没有记忆条目。</p>
          ) : (
            <ul className="space-y-2.5">
              {items.map((m) => (
                <li
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-2 rounded-[1.25rem] border border-[var(--glass-border)] bg-[var(--glass-quiet)] px-3.5 py-3 backdrop-blur-md",
                    m.pinned && "border-[var(--glass-border-vivid)] shadow-[var(--glass-shadow-chip)]",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="home-hub-tint mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold">
                      {KIND_LABEL[m.kind]}
                    </span>
                    <p className="min-w-0 flex-1 text-sm leading-relaxed break-words">{m.content}</p>
                    <div className="flex shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-full"
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
                        className="rounded-full"
                        aria-label="删除"
                        onClick={() => void remove(m)}
                      >
                        <Trash2 className="size-4 opacity-70" />
                      </Button>
                    </div>
                  </div>
                  {m.imageUrl && (
                    <div className="relative w-full">
                      <MemoryImage path={m.imageUrl} alt="记忆图片" />
                      <button
                        type="button"
                        onClick={() => void removeImage(m)}
                        className="absolute -right-2 -top-2 rounded-full border border-[var(--glass-border)] bg-[var(--glass-strong)] p-1 text-foreground shadow-md backdrop-blur-md"
                        aria-label="移除图片"
                      >
                        <X className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
