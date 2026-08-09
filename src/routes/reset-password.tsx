import * as React from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppBackground } from "@/components/kibo/app-background";
import logoAsset from "@/assets/kibotalk-logo.png.asset.json";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — KiboTalk" },
      {
        name: "description",
        content: "Choose a new KiboTalk password after opening the reset link we emailed you.",
      },
      { property: "og:title", content: "Reset password — KiboTalk" },
      {
        property: "og:description",
        content: "Choose a new KiboTalk password from your password reset link.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = React.useState(false);
  const [linkValid, setLinkValid] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    // The recovery link puts a session in place (hash tokens or ?code=).
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setLinkValid(Boolean(data.session));
      setReady(true);
    };
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setLinkValid(true);
        setReady(true);
      }
    });
    // Give supabase-js a beat to parse the URL before judging the link.
    const id = window.setTimeout(() => void check(), 600);
    return () => {
      cancelled = true;
      window.clearTimeout(id);
      sub.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("The two passwords don't match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      window.setTimeout(() => void navigate({ to: "/", replace: true }), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

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
        <h1 className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-primary" />
          Set a new password
        </h1>

        {!ready ? (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" />
            Checking your reset link…
          </p>
        ) : !linkValid ? (
          <>
            <p className="mt-2 text-xs text-muted-foreground">
              This reset link is invalid or has expired. Request a new one from the sign-in page.
            </p>
            <Button className="mt-4 w-full" onClick={() => void navigate({ to: "/auth" })}>
              Back to sign in
            </Button>
          </>
        ) : done ? (
          <p className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-foreground">
            Password updated — signing you in…
          </p>
        ) : (
          <form className="mt-4 space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="new-password">New password</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {error ? (
              <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Update password
            </Button>
          </form>
        )}
      </div>
    </main>
  );
}
