import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Loader2, RefreshCw, Save, ShieldCheck, Users, MessagesSquare, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppBackground } from "@/components/kibo/app-background";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAdminOverview, updateAiModels, updateCoachPrompt, setUserAdmin } from "@/lib/kibo/admin.functions";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "KiboTalk 管理后台 · 用户与会话数据" },
      { name: "description", content: "查看 KiboTalk 用户、会话记录与统计数据，并随时切换对话所用的大模型。" },
      { property: "og:title", content: "KiboTalk 管理后台" },
      { property: "og:description", content: "用户、会话记录与大模型配置的统一管理界面。" },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AdminPage,
});

// DeepSeek official API model ids (see api.deepseek.com).
const MODEL_OPTIONS = ["deepseek-v4-flash", "deepseek-v4-pro"];

// Volcengine speech recognition resource ids.
const STT_OPTIONS = ["volc.bigasr.sauc.duration", "volc.bigasr.auc_turbo"];

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="paper-sheet flex items-center gap-3 rounded-2xl p-4">
      <div className="grid size-9 place-items-center rounded-xl bg-primary/20 text-primary-foreground/80">{icon}</div>
      <div>
        <div className="text-2xl font-semibold leading-none">{value}</div>
        <div className="mt-1 text-xs text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}

function AdminPage() {
  const overview = useServerFn(getAdminOverview);
  const saveModels = useServerFn(updateAiModels);
  const savePrompt = useServerFn(updateCoachPrompt);
  const toggleAdmin = useServerFn(setUserAdmin);
  const qc = useQueryClient();

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => overview({}),
    retry: false,
  });

  const [models, setModels] = React.useState({ suggest: "", summary: "", transcribe: "" });
  React.useEffect(() => {
    if (data?.models) setModels(data.models);
  }, [data?.models]);

  const [prompt, setPrompt] = React.useState("");
  React.useEffect(() => {
    if (data?.coachPrompt) setPrompt(data.coachPrompt);
  }, [data?.coachPrompt]);

  const promptMutation = useMutation({
    mutationFn: () => savePrompt({ data: { prompt } }),
    onSuccess: () => {
      toast.success("思路提示词已更新");
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [openSession, setOpenSession] = React.useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: () => saveModels({ data: models }),
    onSuccess: () => {
      toast.success("大模型配置已更新");
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const roleMutation = useMutation({
    mutationFn: (v: { userId: string; isAdmin: boolean }) => toggleAdmin({ data: v }),
    onSuccess: () => {
      toast.success("权限已更新");
      void qc.invalidateQueries({ queryKey: ["admin-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="relative min-h-dvh">
        <AppBackground />
        <div className="grid min-h-dvh place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="relative min-h-dvh">
        <AppBackground />
        <div className="grid min-h-dvh place-items-center px-6">
          <div className="paper-sheet max-w-sm rounded-3xl p-6 text-center">
            <h1 className="text-lg font-semibold">无法进入管理后台</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              当前账号没有管理员权限，或数据加载失败。
            </p>
            <Button className="mt-4" asChild>
              <Link to="/">返回应用</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const d = data!;

  return (
    <div className="relative min-h-dvh">
      <AppBackground />
      <div className="mx-auto w-full max-w-5xl px-4 py-6">
        <header className="glass-bar mb-5 flex items-center justify-between rounded-2xl px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="soft" size="icon" asChild aria-label="返回">
              <Link to="/"><ArrowLeft className="size-4" /></Link>
            </Button>
            <div>
              <h1 className="text-base font-semibold">管理后台</h1>
              <p className="text-xs text-muted-foreground">用户 · 会话记录 · 大模型配置</p>
            </div>
          </div>
          <Button variant="soft" size="icon" aria-label="刷新" onClick={() => void refetch()}>
            <RefreshCw className={`size-4 ${isFetching ? "animate-spin" : ""}`} />
          </Button>
        </header>

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat icon={<Users className="size-4" />} label="用户" value={d.stats.userCount} />
          <Stat icon={<ShieldCheck className="size-4" />} label="管理员" value={d.stats.adminCount} />
          <Stat icon={<MessagesSquare className="size-4" />} label="会话" value={d.stats.sessionCount} />
          <Stat icon={<Sparkles className="size-4" />} label="近 7 天会话" value={d.stats.sessionsLast7d} />
        </section>

        <section className="paper-sheet mt-5 rounded-3xl p-5">
          <h2 className="text-sm font-semibold">大模型配置</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            修改后立即对所有用户生效（约 30 秒内刷新缓存）。
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {([
              ["suggest", "回复建议模型", MODEL_OPTIONS],
              ["summary", "总结模型", MODEL_OPTIONS],
              ["transcribe", "语音转写模型", STT_OPTIONS],
            ] as const).map(([key, label, options]) => (
              <div key={key}>
                <label className="text-xs font-medium text-muted-foreground" htmlFor={`model-${key}`}>
                  {label}
                </label>
                <Input
                  id={`model-${key}`}
                  list={`options-${key}`}
                  value={models[key]}
                  onChange={(e) => setModels((m) => ({ ...m, [key]: e.target.value }))}
                  className="mt-1"
                />
                <datalist id={`options-${key}`}>
                  {options.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </div>
            ))}
          </div>
          <Button
            className="mt-4 gap-2"
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存配置
          </Button>
        </section>

        <section className="paper-sheet mt-5 rounded-3xl p-5">
          <h2 className="text-sm font-semibold">思路提示词</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            生成回复建议时附加的表达教练规则（结论先行、听众视角、举例比喻、画面感、前后一致、时间感知、金句捕捉、不跑题、立场清晰）。修改后约 30 秒内对所有用户生效。
          </p>
          <Textarea
            className="mt-3 min-h-64 font-mono text-xs leading-relaxed"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="输入教练提示词…"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              className="gap-2"
              disabled={promptMutation.isPending}
              onClick={() => promptMutation.mutate()}
            >
              {promptMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              保存提示词
            </Button>
            <Button
              variant="soft"
              onClick={() => setPrompt(d.defaultCoachPrompt)}
              disabled={prompt === d.defaultCoachPrompt}
            >
              恢复默认
            </Button>
          </div>
        </section>

        <section className="paper-sheet mt-5 rounded-3xl p-5">
          <h2 className="text-sm font-semibold">用户与权限</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">邮箱</th>
                  <th className="py-2 pr-3 font-medium">注册时间</th>
                  <th className="py-2 pr-3 font-medium">最近登录</th>
                  <th className="py-2 pr-3 font-medium">会话</th>
                  <th className="py-2 font-medium">管理员</th>
                </tr>
              </thead>
              <tbody>
                {d.users.map((u) => (
                  <tr key={u.id} className="border-t border-border/40">
                    <td className="py-2 pr-3">{u.email || u.id.slice(0, 8)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{fmt(u.createdAt)}</td>
                    <td className="py-2 pr-3 text-xs text-muted-foreground">{fmt(u.lastSignInAt)}</td>
                    <td className="py-2 pr-3">{u.sessionCount}</td>
                    <td className="py-2">
                      <Button
                        size="sm"
                        variant={u.isAdmin ? "default" : "soft"}
                        disabled={roleMutation.isPending}
                        onClick={() => roleMutation.mutate({ userId: u.id, isAdmin: !u.isAdmin })}
                      >
                        {u.isAdmin ? "撤销管理员" : "设为管理员"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="paper-sheet mt-5 mb-10 rounded-3xl p-5">
          <h2 className="text-sm font-semibold">会话记录</h2>
          {d.sessions.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">暂无会话记录。</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {d.sessions.map((s) => (
                <li key={s.id} className="glass-quiet rounded-2xl p-3">
                  <button
                    className="flex w-full items-center justify-between gap-3 text-left"
                    onClick={() => setOpenSession(openSession === s.id ? null : s.id)}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{s.email}</span>
                      <span className="block text-xs text-muted-foreground">
                        {fmt(s.startedAt)} · {s.conversationLang} · {s.level} · {s.turnCount} 轮
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {openSession === s.id ? "收起" : "展开"}
                    </span>
                  </button>
                  {openSession === s.id && (
                    <div className="mt-3 space-y-2 border-t border-border/40 pt-3">
                      {s.summary && <p className="text-xs text-muted-foreground">{s.summary}</p>}
                      {s.turns.map((t, i) => (
                        <p key={i} className="text-sm">
                          <span className="mr-2 text-xs font-medium text-muted-foreground">
                            {t.speaker === "user" ? "我" : "对方"}
                          </span>
                          {t.text}
                        </p>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
