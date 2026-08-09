import { createFileRoute, redirect } from "@tanstack/react-router";
import * as React from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AppBackground } from "@/components/kibo/app-background";
import logoAsset from "@/assets/kibotalk-logo.png.asset.json";

type OAuthResult = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string } | null;
};

// `supabase.auth.oauth` is still beta and missing from the generated types.
const oauth = (
  supabase.auth as unknown as {
    oauth: {
      getAuthorizationDetails: (id: string) => Promise<{ data: OAuthResult | null; error: Error | null }>;
      approveAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: Error | null }>;
      denyAuthorization: (id: string) => Promise<{ data: OAuthResult | null; error: Error | null }>;
    };
  }
).oauth;

export const Route = createFileRoute("/.lovable/oauth/consent")({
  // Browser-only: the Supabase session lives in localStorage.
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s['authorization_id'] === "string" ? (s['authorization_id'] as string) : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      throw redirect({ to: "/auth", search: { next: location.pathname + location.searchStr } });
    }
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AppBackground />
      <div className="paper-sheet w-full max-w-sm p-6 text-xs text-muted-foreground">
        无法加载此授权请求：{String((error as Error)?.message ?? error)}
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const clientName = details?.client?.name ?? "外部应用";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error: err } = approve
      ? await oauth.approveAuthorization(authorization_id)
      : await oauth.denyAuthorization(authorization_id);
    if (err) {
      setBusy(false);
      setError(err.message);
      return;
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      setError("授权服务器没有返回跳转地址。");
      return;
    }
    window.location.href = target;
  }

  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <AppBackground />
      <div className="paper-sheet w-full max-w-sm p-6 sm:p-8">
        <img src={logoAsset.url} alt="KiboTalk" className="h-8 w-auto select-none" draggable={false} />
        <h1 className="mt-4 flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="size-4 text-primary" />
          允许 {clientName} 访问你的 KiboTalk？
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          授权后，{clientName} 可以以你的身份读取、删除你的会话记录，并查询情绪词库。你随时可以在对方应用中断开连接。
        </p>
        {error && (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <Button className="flex-1" disabled={busy} onClick={() => void decide(true)}>
            {busy && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            允许
          </Button>
          <Button variant="soft" className="flex-1" disabled={busy} onClick={() => void decide(false)}>
            拒绝
          </Button>
        </div>
      </div>
    </main>
  );
}
