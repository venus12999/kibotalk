import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { DEFAULT_MODELS, type AiModels } from "./model-config.server";
import { assertAdmin } from "./admin-core.server";

export const checkIsAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    return { isAdmin: Boolean(data) };
  });

export type AdminUser = {
  id: string;
  email: string;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  isAdmin: boolean;
  sessionCount: number;
};

export type AdminSession = {
  id: string;
  userId: string;
  email: string;
  startedAt: string;
  endedAt: string;
  conversationLang: string;
  level: string;
  turnCount: number;
  summary: string;
  turns: { speaker: string; text: string }[];
};

export const getAdminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [{ data: authUsers }, { data: profiles }, { data: roles }, { data: sessions }] =
      await Promise.all([
        supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 }),
        supabaseAdmin.from("profiles").select("id, display_name"),
        supabaseAdmin.from("user_roles").select("user_id, role"),
        supabaseAdmin
          .from("sessions")
          .select("id, user_id, started_at, ended_at, conversation_lang, level, summary, turns")
          .order("started_at", { ascending: false })
          .limit(300),
      ]);

    const emailById = new Map<string, string>();
    const users: AdminUser[] = [];
    const adminIds = new Set((roles ?? []).filter((r) => r.role === "admin").map((r) => r.user_id));
    const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name] as const));
    const counts = new Map<string, number>();
    for (const s of sessions ?? []) counts.set(s.user_id, (counts.get(s.user_id) ?? 0) + 1);

    for (const u of authUsers?.users ?? []) {
      emailById.set(u.id, u.email ?? "");
      users.push({
        id: u.id,
        email: u.email ?? "",
        displayName: nameById.get(u.id) ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        isAdmin: adminIds.has(u.id),
        sessionCount: counts.get(u.id) ?? 0,
      });
    }
    users.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    const sessionRows: AdminSession[] = (sessions ?? []).map((s) => {
      const turns = Array.isArray(s.turns) ? (s.turns as any[]) : [];
      return {
        id: s.id,
        userId: s.user_id,
        email: emailById.get(s.user_id) ?? "—",
        startedAt: s.started_at,
        endedAt: s.ended_at,
        conversationLang: s.conversation_lang,
        level: s.level,
        turnCount: turns.length,
        summary: s.summary ?? "",
        turns: turns.map((t) => ({
          speaker: String(t?.speaker ?? "other"),
          text: String(t?.text ?? ""),
        })),
      };
    });

    const dayMs = 86_400_000;
    const since = Date.now() - 7 * dayMs;
    const stats = {
      userCount: users.length,
      adminCount: adminIds.size,
      sessionCount: sessionRows.length,
      turnCount: sessionRows.reduce((n, s) => n + s.turnCount, 0),
      sessionsLast7d: sessionRows.filter((s) => new Date(s.startedAt).getTime() >= since).length,
    };

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", "ai_models")
      .maybeSingle();
    const value = (settings?.value ?? {}) as Partial<AiModels>;
    const models: AiModels = { ...DEFAULT_MODELS, ...value };

    const { getCoachPrompt, DEFAULT_COACH_PROMPT } = await import("./coach-prompt.server");
    const coachPrompt = await getCoachPrompt();

    return {
      stats,
      users,
      sessions: sessionRows,
      models,
      coachPrompt,
      defaultCoachPrompt: DEFAULT_COACH_PROMPT,
    };
  });

export const updateAiModels = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AiModels) => {
    const clean = (v: unknown) => String(v ?? "").trim();
    const models = {
      suggest: clean(input.suggest),
      summary: clean(input.summary),
      transcribe: clean(input.transcribe),
    };
    if (!models.suggest || !models.summary || !models.transcribe) {
      throw new Error("All model ids are required");
    }
    return models;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("app_settings")
      .upsert({
        key: "ai_models",
        value: data,
        updated_by: context.userId,
        updated_at: new Date().toISOString(),
      });
    if (error) throw new Error(error.message);
    return { ok: true, models: data };
  });

export const updateCoachPrompt = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { prompt: string }) => {
    const prompt = String(input?.prompt ?? "").trim();
    if (!prompt) throw new Error("提示词不能为空");
    if (prompt.length > 8000) throw new Error("提示词过长（上限 8000 字）");
    return { prompt };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("app_settings").upsert({
      key: "coach_prompt",
      value: { prompt: data.prompt },
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    return { ok: true, prompt: data.prompt };
  });

export const setUserAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: { userId: string; isAdmin: boolean }) => input)
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    if (data.userId === context.userId && !data.isAdmin) {
      throw new Error("You cannot remove your own admin access");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.isAdmin) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: data.userId, role: "admin" }, { onConflict: "user_id,role" });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });
