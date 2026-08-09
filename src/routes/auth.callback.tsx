import * as React from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Loader2, MailWarning } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/kibo/app-background";
import logoAsset from "@/assets/kibotalk-logo.png.asset.json";

export const Route = createFileRoute("/auth/callback")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Confirming your email — KiboTalk" },
      {
        name: "description",
        content: "Finishing your KiboTalk email confirmation and signing you in.",
      },
      { property: "og:title", content: "Confirming your email — KiboTalk" },
      {
        property: "og:description",
        content: "Finishing your KiboTalk email confirmation and signing you in.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AuthCallback,
});

/** Read error / code info from both the query string and the hash fragment. */
function readParams() {
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const get = (key: string) => query.get(key) ?? hash.get(key);
  return {
    code: get("code"),
    error: get("error"),
    errorCode: get("error_code"),
    description: get("error_description"),
    hasTokens: Boolean(hash.get("access_token")),
  };
}

function friendlyError(errorCode: string | null, description: string | null) {
  const raw = `${errorCode ?? ""} ${description ?? ""}`;
  if (/expired/i.test(raw)) {
    return "这个确认链接已经过期了。回到登录页重新发送一封确认邮件即可。";
  }
  if (/invalid|already|used/i.test(raw)) {
    return "这个确认链接无效或已经被使用过。请重新发送一封确认邮件，或直接登录。";
  }
  return description?.replace(/\+/g, " ") || "确认链接无法验证，请重新发送一封确认邮件。";
}

function AuthCallback() {
  const navigate = useNavigate();
  // Preserve a same-origin return path (e.g. the OAuth consent page).
  const goNext = React.useCallback(() => {
    const raw = new URLSearchParams(window.location.search).get("next") ?? "";
    return raw.startsWith("/") && !raw.startsWith("//")
      ? navigate({ href: raw, replace: true })
      : navigate({ to: "/", replace: true });
  }, [navigate]);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    let cancelled = false;

    const finish = async () => {
      const { code, error: err, errorCode, description, hasTokens } = readParams();

      if (err || errorCode) {
        setError(friendlyError(errorCode, description));
        return;
      }

      // PKCE links arrive with ?code=...; implicit links carry tokens in the hash
      // and supabase-js picks those up automatically.
      if (code) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (exchangeError) {
          setError(friendlyError(null, exchangeError.message));
          return;
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        await goNext();
        return;
      }

      if (hasTokens) {
        // Give supabase-js a beat to hydrate from the hash, then re-check.
        const { data: retry } = await supabase.auth.getSession();
        if (cancelled) return;
        if (retry.session) {
          await goNext();
          return;
        }
      }

      setError("确认链接已失效或已被使用，请重新发送一封确认邮件。");
    };

    void finish();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session) void goNext();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [navigate, goNext]);

  if (!error) {
    return (
      <main className="flex min-h-dvh items-center justify-center p-4">
        <AppBackground />
        <div className="paper-sheet flex w-full max-w-sm flex-col items-center gap-3 p-8">
          <img
            src={logoAsset.url}
            alt="KiboTalk"
            className="h-8 w-auto select-none"
            draggable={false}
          />
          <Loader2 className="size-5 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground">正在确认你的邮箱，马上带你进入…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AppBackground />
      <div className="paper-sheet w-full max-w-sm p-6 sm:p-8">
        <img
          src={logoAsset.url}
          alt="KiboTalk"
          className="h-8 w-auto select-none"
          draggable={false}
        />
        <h1 className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <MailWarning className="size-4 text-destructive" />
          链接无法使用
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">{error}</p>
        <Button className="mt-4 w-full" onClick={() => void navigate({ to: "/auth" })}>
          回到登录页重新发送
        </Button>
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          确认邮箱后才能开始使用。
        </p>

      </div>
    </main>
  );
}
