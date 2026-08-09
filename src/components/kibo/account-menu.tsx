import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, User as UserIcon, Cloud, Loader2, Shield } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { checkIsAdmin } from "@/lib/kibo/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useKibo } from "@/lib/kibo/store";

const copy = {
  zh: { signIn: "登录 / 云同步", signOut: "退出登录", synced: "已云同步", syncing: "同步中…" },
  ja: { signIn: "ログイン / 同期", signOut: "ログアウト", synced: "クラウド同期済み", syncing: "同期中…" },
  en: { signIn: "Sign in / sync", signOut: "Sign out", synced: "Synced to cloud", syncing: "Syncing…" },
} as const;

export function AccountMenu() {
  const { user, prefs, syncing } = useKibo();
  const navigate = useNavigate();
  const words = copy[prefs.uiLang] ?? copy.en;
  const isAdminFn = useServerFn(checkIsAdmin);
  const { data: adminInfo } = useQuery({
    queryKey: ["is-admin", user?.id ?? "anon"],
    queryFn: () => isAdminFn({}),
    enabled: Boolean(user),
    retry: false,
    staleTime: 5 * 60_000,
  });

  if (!user) {
    return (
      <Button variant="soft" size="icon" aria-label={words.signIn} onClick={() => void navigate({ to: "/auth" })}>
        <LogIn className="size-4" />
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="soft" size="icon" aria-label={user.email ?? "account"}>
          {syncing ? <Loader2 className="size-4 animate-spin" /> : <UserIcon className="size-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate text-xs font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuItem disabled className="gap-2 text-xs">
          <Cloud className="size-3.5" />
          {syncing ? words.syncing : words.synced}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {adminInfo?.isAdmin && (
          <DropdownMenuItem className="gap-2" onClick={() => void navigate({ to: "/admin" })}>
            <Shield className="size-3.5" />
            管理后台
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          className="gap-2"
          onClick={async () => {
            await supabase.auth.signOut();
          }}
        >
          <LogOut className="size-3.5" />
          {words.signOut}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
