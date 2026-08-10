import { supabase } from "@/integrations/supabase/client";

export type MemoryKind = "profile" | "preference" | "relationship" | "goal" | "other";

export type MemoryItem = {
  id: string;
  content: string;
  kind: MemoryKind;
  pinned: boolean;
  createdAt: number;
};

export const MEMORY_KINDS: MemoryKind[] = [
  "profile",
  "preference",
  "relationship",
  "goal",
  "other",
];

type Row = {
  id: string;
  content: string;
  kind: string;
  pinned: boolean;
  created_at: string;
};

const toItem = (row: Row): MemoryItem => ({
  id: row.id,
  content: row.content,
  kind: (MEMORY_KINDS as string[]).includes(row.kind) ? (row.kind as MemoryKind) : "other",
  pinned: row.pinned,
  createdAt: new Date(row.created_at).getTime(),
});

export async function listMemories(userId: string): Promise<MemoryItem[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, content, kind, pinned, created_at")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => toItem(r as Row));
}

export async function addMemory(
  userId: string,
  input: { content: string; kind: MemoryKind; pinned?: boolean },
): Promise<MemoryItem> {
  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: userId,
      content: input.content.trim().slice(0, 500),
      kind: input.kind,
      pinned: input.pinned ?? false,
    })
    .select("id, content, kind, pinned, created_at")
    .single();
  if (error) throw error;
  return toItem(data as Row);
}

export async function updateMemory(
  id: string,
  patch: { content?: string; kind?: MemoryKind; pinned?: boolean },
) {
  const { error } = await supabase.from("memories").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteMemory(id: string) {
  const { error } = await supabase.from("memories").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Compact list of the memories worth sending to the coach: pinned first, then
 * the newest ones. Kept short so it never crowds out the live transcript.
 */
export async function loadMemoryContext(userId: string, limit = 12): Promise<string[]> {
  try {
    const all = await listMemories(userId);
    return all.slice(0, limit).map((m) => `[${m.kind}] ${m.content}`);
  } catch {
    return [];
  }
}

/** Mark the memories that were actually fed to a suggestion as used. */
export async function touchMemories(ids: string[]) {
  if (ids.length === 0) return;
  await supabase
    .from("memories")
    .update({ last_used_at: new Date().toISOString() })
    .in("id", ids);
}
