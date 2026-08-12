import * as React from "react";
import { useNavigate } from "@tanstack/react-router";
import { LogIn, LogOut, User as UserIcon, Cloud, Loader2, Shield, Brain } from "lucide-react";
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
  zh: {
    signIn: "登录",
    signOut: "退出登录",
    synced: "已云同步",
    syncing: "同步中…",
    memory: "我的资料与记忆",
    account: "账号",
  },
  ja: {
    signIn: "ログイン",
    signOut: "ログアウト",
    synced: "クラウド同期済み",
    syncing: "同期中…",
    memory: "プロフィールと記憶",
    account: "アカウント",
  },
  en: {
    signIn: "Sign in",
    signOut: "Sign out",
    synced: "Synced to cloud",
    syncing: "Syncing…",
    memory: "Profile & memory",
    account: "Account",
  },
} as const;

type Props = {
  /** Icon-only trigger for black/white home header. */
  compact?: boolean;
};

export function AccountMenu({ compact = false }: Props) {
  const { user, prefs, syncing, t } = useKibo();
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

  const compactTriggerClass =
    "glass-chip size-10 rounded-[0.85rem] border-0 p-0 text-foreground shadow-none hover:brightness-[1.03] active:scale-[0.97]";

  if (!user) {
    return (
      <Button
        variant={compact ? "ghost" : "soft"}
        size={compact ? "icon" : "sm"}
        className={
          compact
            ? compactTriggerClass
            : "h-8 gap-1 px-2 text-xs font-semibold"
        }
        aria-label={words.signIn}
        onClick={() => void navigate({ to: "/auth" })}
      >
        <LogIn className={compact ? "size-4" : "size-3.5"} />
        {compact ? null : <span>{words.signIn}</span>}
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon" : "sm"}
          className={
            compact
              ? compactTriggerClass
              : "h-8 gap-1 px-1.5 text-xs font-semibold sm:px-2"
          }
          aria-label={user.email ?? words.account}
        >
          {syncing ? (
            <Loader2 className={compact ? "size-4 animate-spin" : "size-3.5 animate-spin"} />
          ) : (
            <UserIcon className={compact ? "size-4" : "size-3.5"} strokeWidth={compact ? 1.75 : 2} />
          )}
          {compact ? null : (
            <span className="max-w-14 truncate sm:max-w-24">{t("navAccount")}</span>
          )}
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
        <DropdownMenuItem className="gap-2" onClick={() => void navigate({ to: "/memory" })}>
          <Brain className="size-3.5" />
          {words.memory}
        </DropdownMenuItem>
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
