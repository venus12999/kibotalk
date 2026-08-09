import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, KeyRound, Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppBackground } from "@/components/kibo/app-background";
import logoAsset from "@/assets/kibotalk-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "登录 — KiboTalk 语言陪练" },
      {
        name: "description",
        content: "登录 KiboTalk，同步你的偏好设置、语音配置与会话记录，随时随地继续练习口语。",
      },
      { property: "og:title", content: "登录 — KiboTalk 语言陪练" },
      {
        property: "og:description",
        content: "登录 KiboTalk，跨设备同步偏好设置与会话记录。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<"signin" | "signup" | "verify" | "forgot">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [showConfirm, setShowConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);
  const PASSWORD_HINT = "至少 6 位，可包含字母、数字或符号。";

  // Mobile keyboards love to capitalize and append a space — normalize before
  // sending, otherwise Supabase reports "invalid credentials" for a correct password.
  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password;

  const describeError = (raw: string) => {
    if (/invalid login credentials|invalid_credentials/i.test(raw))
      return "邮箱或密码不正确。请检查有没有多余空格或大小写问题；忘记密码可以点下方「忘记密码？」重设。";
    if (/rate|too many|seconds/i.test(raw)) return "请求过于频繁，请稍等一会儿再试。";
    if (/network|fetch/i.test(raw)) return "网络连接失败，请检查网络后重试。";
    return raw;
  };

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        void navigate({ to: "/", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  React.useEffect(() => {
    if (mode !== "verify") return;
    const id = window.setInterval(() => {
      void supabase.auth.getSession().then(({ data }) => {
        if (data.session) void navigate({ to: "/", replace: true });
      });
    }, 4000);
    return () => window.clearInterval(id);
  }, [mode, navigate]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const goVerify = (message: string) => {
    setMode("verify");
    setError("");
    setNotice(message);
    setCooldown(60);
  };

  const checkNow = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await navigate({ to: "/", replace: true });
        return;
      }
      if (cleanPassword) {
        const { data: signed, error: err } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (signed.session) {
          await navigate({ to: "/", replace: true });
          return;
        }
        if (err && !/not confirmed|confirm your email/i.test(err.message)) throw err;
      }
      setNotice("还没有检测到验证完成，请先打开邮件里的链接，再点这里继续。");
    } catch (err) {
      setError(describeError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email: cleanEmail,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) throw err;
      setNotice(`新的验证链接已发送至 ${cleanEmail}。`);
      setCooldown(60);
    } catch (err) {
      setError(describeError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const sendReset = async () => {
    if (busy || cooldown > 0) return;
    if (!cleanEmail) {
      setError("请先填写邮箱。");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setNotice(`重设密码链接已发送至 ${cleanEmail}，打开邮件即可设置新密码。`);
      setCooldown(60);
    } catch (err) {
      setError(describeError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup") {
      if (cleanPassword.length < 6) {
        setError(`密码太短。${PASSWORD_HINT}`);
        return;
      }
      if (cleanPassword !== confirm) {
        setError("两次输入的密码不一致。");
        return;
      }
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email: cleanEmail,
          password: cleanPassword,
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
        });
        if (err) {
          if (/already registered|already exists|User already/i.test(err.message)) {
            setError("该邮箱已注册，请直接登录。");
            setMode("signin");
            return;
          }
          throw err;
        }
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setError("该邮箱已注册，请直接登录。");
          setMode("signin");
          return;
        }
        if (!data.session) {
          goVerify(`验证链接已发送至 ${cleanEmail}，打开邮件即可激活账号。`);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });
        if (err) {
          if (/not confirmed|confirm your email/i.test(err.message)) {
            goVerify("邮箱还没有验证，请先打开我们发送的验证链接。");
            return;
          }
          throw err;
        }
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(describeError(err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  if (mode === "forgot") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <AppBackground />
        <div className="paper-sheet w-full max-w-sm p-6 sm:p-8">
          <div className="flex items-center">
            <img
              src={logoAsset.url}
              alt="KiboTalk"
              className="h-8 w-auto select-none"
              draggable={false}
            />
          </div>
          <h2 className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <KeyRound className="size-4 text-primary" />
            重设密码
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            输入注册邮箱，我们会发送一封设置新密码的邮件。
          </p>

          <form
            className="mt-4 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void sendReset();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="reset-email">邮箱</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground">{notice}</p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy || cooldown > 0}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              {cooldown > 0 ? `${cooldown} 秒后可重新发送` : "发送重设链接"}
            </Button>
          </form>

          <button
            type="button"
            className="mt-4 w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode("signin");
              setError("");
              setNotice("");
            }}
          >
            返回登录
          </button>
        </div>
      </main>
    );
  }

  if (mode === "verify") {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <AppBackground />
        <div className="paper-sheet w-full max-w-sm p-6 sm:p-8">
          <div className="flex items-center">
            <img
              src={logoAsset.url}
              alt="KiboTalk"
              className="h-8 w-auto select-none"
              draggable={false}
            />
          </div>
          <h2 className="mt-4 flex items-center gap-2 text-sm font-semibold">
            <MailCheck className="size-4 text-primary" />
            验证你的邮箱
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            验证链接已发送至 <span className="font-medium text-foreground">{cleanEmail}</span>
            。点击链接后会自动登录。链接有时效，失效了可以重新发送。
          </p>

          {error ? (
            <p className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground">
              {notice}
            </p>
          ) : null}

          <Button className="mt-3 w-full" disabled={busy} onClick={() => void checkNow()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            我已验证，继续
          </Button>

          <Button
            variant="soft"
            className="mt-2 w-full"
            disabled={busy || cooldown > 0}
            onClick={() => void resend()}
          >
            {cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送验证邮件"}
          </Button>

          <button
            type="button"
            className="mt-4 w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setMode("signin");
              setError("");
              setNotice("");
            }}
          >
            返回登录
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AppBackground />
      <div className="paper-sheet w-full max-w-sm p-6 sm:p-8">
        <div className="flex items-center">
          <img
            src={logoAsset.url}
            alt="KiboTalk"
            className="h-8 w-auto select-none"
            draggable={false}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {mode === "signin"
            ? "使用邮箱登录，同步你的会话记录与设置"
            : "使用邮箱注册 —— 每个邮箱只能创建一个账号"}
        </p>

        <form className="mt-5 space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {mode === "signup" ? (
              <p className="text-[11px] text-muted-foreground">{PASSWORD_HINT}</p>
            ) : null}
          </div>
          {mode === "signup" ? (
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">确认密码</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
              {confirm && confirm !== password ? (
                <p className="text-[11px] text-destructive">两次输入的密码不一致。</p>
              ) : null}
            </div>
          ) : null}
          {error ? (
            <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground">{notice}</p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "signin" ? "登录" : "注册"}
          </Button>
        </form>

        {mode === "signin" ? (
          <button
            type="button"
            className="mt-3 w-full text-xs text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setMode("forgot");
              setError("");
              setNotice("");
              setCooldown(0);
            }}
          >
            忘记密码？
          </button>
        ) : null}

        <button
          type="button"
          className="mt-4 w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setConfirm("");
            setError("");
            setNotice("");
          }}
        >
          {mode === "signin" ? "还没有账号？立即注册" : "已有账号？去登录"}
        </button>

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          账号需完成邮箱验证后才能开始会话。
        </p>
      </div>
    </main>
  );
}
