import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
  const [mode, setMode] = React.useState<"signin" | "signup" | "verify" | "forgot">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [notice, setNotice] = React.useState("");
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void navigate({ to: "/", replace: true });
    });
    // The confirmation link signs the user in — leave the verify screen as soon
    // as it lands, including when the link was opened in another tab (supabase-js
    // mirrors the session across tabs and emits SIGNED_IN here).
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && session) {
        void navigate({ to: "/", replace: true });
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  // While waiting on the email, poll gently so a confirmation completed on the
  // phone still lands the user in the app on this device.
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

  /** Explicit "I clicked the link" path for users who confirmed elsewhere. */
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
      if (password) {
        const { data: signed, error: err } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signed.session) {
          await navigate({ to: "/", replace: true });
          return;
        }
        if (err && !/not confirmed|confirm your email/i.test(err.message)) throw err;
      }
      setNotice("Still waiting on the confirmation — open the link in the email, then try again.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
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
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (err) throw err;
      setNotice(`A new confirmation link is on its way to ${email}.`);
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


  const sendReset = async () => {
    if (busy || cooldown > 0) return;
    if (!email) {
      setError("Enter your email first.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setNotice(`We sent a password reset link to ${email}. Open it to choose a new password.`);
      setCooldown(60);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(
        /rate|too many|seconds/i.test(msg)
          ? "Too many requests — please wait a moment before asking for another email."
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
          options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
          goVerify(`We sent a confirmation link to ${email}. Open it to activate your account.`);
          return;
        }
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          if (/not confirmed|confirm your email/i.test(err.message)) {
            goVerify("Your email isn't verified yet. Open the confirmation link we emailed you.");
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
            We sent a confirmation link to{" "}
            <span className="font-medium text-foreground">{email}</span>. Click it and you'll be
            signed in automatically. Links expire after a while — if yours no longer works, send a
            new one.
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
            I've confirmed — continue
          </Button>

          <Button
            variant="soft"
            className="mt-2 w-full"
            disabled={busy || cooldown > 0}
            onClick={() => void resend()}
          >
            {cooldown > 0 ? `Resend link in ${cooldown}s` : "Resend confirmation email"}
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
            Forgot your password?
          </button>
        ) : null}



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

        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Every account needs a confirmed email before you can start a session.
        </p>

      </div>
    </main>
  );
}
