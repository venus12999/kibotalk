import { supabase } from "@/integrations/supabase/client";
import type { Prefs, SessionRecord } from "./types";

export async function loadCloudPrefs(userId: string): Promise<Partial<Prefs> | null> {
  const { data } = await supabase
    .from("user_prefs")
    .select("prefs")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.prefs as Partial<Prefs> | undefined) ?? null;
}

export async function saveCloudPrefs(userId: string, prefs: Prefs) {
  await supabase
    .from("user_prefs")
    .upsert(
      { user_id: userId, prefs: prefs as never, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
}

export async function loadCloudSessions(userId: string): Promise<SessionRecord[]> {
  const { data } = await supabase
    .from("sessions")
    .select("id, started_at, ended_at, conversation_lang, level, turns, summary")
    .eq("user_id", userId)
    .order("started_at", { ascending: false })
    .limit(50);
  return (data ?? []).map((row) => ({
    id: row.id,
    startedAt: new Date(row.started_at).getTime(),
    endedAt: new Date(row.ended_at).getTime(),
    conversationLang: row.conversation_lang as SessionRecord["conversationLang"],
    level: row.level as SessionRecord["level"],
    turns: (row.turns as SessionRecord["turns"]) ?? [],
    summary: row.summary ?? "",
  }));
}

export async function saveCloudSession(userId: string, s: SessionRecord) {
  const { data } = await supabase
    .from("sessions")
    .insert({
      user_id: userId,
      started_at: new Date(s.startedAt).toISOString(),
      ended_at: new Date(s.endedAt).toISOString(),
      conversation_lang: s.conversationLang,
      level: s.level,
      turns: s.turns as never,
      summary: s.summary,
    })
    .select("id")
    .maybeSingle();
  return data?.id ?? s.id;
}

export async function deleteCloudSession(userId: string, id: string) {
  await supabase.from("sessions").delete().eq("user_id", userId).eq("id", id);
}

export async function clearCloudSessions(userId: string) {
  await supabase.from("sessions").delete().eq("user_id", userId);
}
