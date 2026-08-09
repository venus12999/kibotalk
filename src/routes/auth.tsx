import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppBackground } from "@/components/kibo/app-background";
import logoAsset from "@/assets/kibotalk-logo.png.asset.json";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — KiboTalk" },
      {
        name: "description",
        content:
          "Sign in to KiboTalk to sync your preferences, voice settings and conversation history across devices.",
      },
      { property: "og:title", content: "Sign in — KiboTalk" },
      {
        property: "og:description",
        content: "Sync your KiboTalk preferences and conversation history across devices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = React.useState<"signin" | "signup" | "verify">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);
  const [code, setCode] = React.useState("");

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/" });
    });
    // The confirmation link signs the user in — leave the verify screen as soon as it lands.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const goVerify = (message: string) => {
    setMode("verify");
    setError("");
    setNotice(message);
    setCode("");
    setCooldown(60);
  };

  const verifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: err } = await supabase.auth.verifyOtp({
        email,
        token: code.trim(),
        type: "signup",
      });
      if (err) {
        setError(
          /expired/i.test(err.message)
            ? "That code has expired. Request a new one below."
            : /invalid|token/i.test(err.message)
              ? "That code isn't right. Check the email and try again."
              : err.message,
        );
        return;
      }
      await navigate({ to: "/" });
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
        email,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) throw err;
      setNotice(`A new verification code is on its way to ${email}.`);
      setCode("");
      setCooldown(60);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /rate|too many|seconds/i.test(msg)
          ? "Too many requests — please wait a moment before asking for another code."
          : msg,
      );
    } finally {
      setBusy(false);
    }
  };


  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) {
          if (/already registered|already exists|User already/i.test(err.message)) {
            setError("This email already has an account. Sign in instead.");
            setMode("signin");
            return;
          }
          throw err;
        }
        // Supabase returns an empty identities array when the email is taken.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setError("This email already has an account. Sign in instead.");
          setMode("signin");
          return;
        }
        if (!data.session) {
          goVerify(`We sent a 6-digit verification code to ${email}.`);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          if (/not confirmed|confirm your email/i.test(err.message)) {
            goVerify("Your email isn't verified yet. Enter the code we emailed you.");
            return;
          }
          throw err;
        }
      }
      await navigate({ to: "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
            Confirm your email
          </h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Click the link we emailed to <span className="font-medium text-foreground">{email}</span>
            . This page signs you in automatically once it&apos;s confirmed. Links expire after a
            while — if yours no longer works, send a fresh one.
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

          <Button
            className="mt-5 w-full"
            disabled={busy || cooldown > 0}
            onClick={() => void resend()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend confirmation email"}
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
            Back to sign in
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
            ? "Sign in with your email to sync your sessions"
            : "Create an account with your email — one account per email address"}
        </p>


        <form className="mt-5 space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        <button
          type="button"
          className="mt-4 w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError("");
            setNotice("");
          }}
        >
          {mode === "signin" ? "No account? Create one" : "Already have an account? Sign in"}
        </button>

        <Link
          to="/"
          className="mt-3 block text-center text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Continue without an account
        </Link>
      </div>
    </main>
  );
}
