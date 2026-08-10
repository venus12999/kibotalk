import { supabase } from "@/integrations/supabase/client";

export type MemoryKind = "profile" | "preference" | "relationship" | "goal" | "other";

export type MemoryItem = {
  id: string;
  content: string;
  kind: MemoryKind;
  pinned: boolean;
  imageUrl: string | null;
  createdAt: number;
};

export const MEMORY_KINDS: MemoryKind[] = [
  "profile",
  "preference",
  "relationship",
  "goal",
  "other",
];

const MAX_FILE_SIZE = 4 * 1024 * 1024;

const extOf = (file: File) => {
  const parts = file.name.split(".");
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : "";
};

const objectPath = (userId: string, ext: string) => {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return ext ? `${userId}/${id}.${ext}` : `${userId}/${id}`;
};

const toItem = (row: {
  id: string;
  content: string;
  kind: string;
  pinned: boolean;
  image_url: string | null;
  created_at: string;
}): MemoryItem => ({
  id: row.id,
  content: row.content,
  kind: (MEMORY_KINDS as string[]).includes(row.kind) ? (row.kind as MemoryKind) : "other",
  pinned: row.pinned,
  imageUrl: row.image_url,
  createdAt: new Date(row.created_at).getTime(),
});

export async function listMemories(userId: string): Promise<MemoryItem[]> {
  const { data, error } = await supabase
    .from("memories")
    .select("id, content, kind, pinned, image_url, created_at")
    .eq("user_id", userId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data ?? []).map((r) => toItem(r as Parameters<typeof toItem>[0]));
}

export async function addMemory(
  userId: string,
  input: { content: string; kind: MemoryKind; pinned?: boolean; imageUrl?: string | null },
): Promise<MemoryItem> {
  const { data, error } = await supabase
    .from("memories")
    .insert({
      user_id: userId,
      content: input.content.trim().slice(0, 500),
      kind: input.kind,
      pinned: input.pinned ?? false,
      image_url: input.imageUrl ?? null,
    })
    .select("id, content, kind, pinned, image_url, created_at")
    .single();
  if (error) throw error;
  return toItem(data as Parameters<typeof toItem>[0]);
}

export async function updateMemory(
  id: string,
  patch: { content?: string; kind?: MemoryKind; pinned?: boolean; imageUrl?: string | null },
) {
  const update: {
    content?: string;
    kind?: MemoryKind;
    pinned?: boolean;
    image_url?: string | null;
  } = {};
  if (patch.content !== undefined) update.content = patch.content.trim().slice(0, 500);
  if (patch.kind !== undefined) update.kind = patch.kind;
  if (patch.pinned !== undefined) update.pinned = patch.pinned;
  if (patch.imageUrl !== undefined) update.image_url = patch.imageUrl ?? null;
  const { error } = await supabase.from("memories").update(update).eq("id", id);
  if (error) throw error;
}

export async function deleteMemory(id: string) {
  const { error } = await supabase.from("memories").delete().eq("id", id);
  if (error) throw error;
}

export async function deleteMemoryItem(item: MemoryItem) {
  if (item.imageUrl) {
    await deleteStorageObject(item.imageUrl).catch(() => undefined);
  }
  await deleteMemory(item.id);
}

export async function uploadMemoryImage(userId: string, file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("只能上传图片文件");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw new Error("图片大小不能超过 4MB");
  }
  const path = objectPath(userId, extOf(file));
  const { error } = await supabase.storage.from("memory").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type,
  });
  if (error) throw error;
  return path;
}

export async function getSignedImageUrl(path: string, expiresIn = 3600): Promise<string> {
  const { data, error } = await supabase.storage.from("memory").createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

export async function deleteStorageObject(path: string) {
  const { error } = await supabase.storage.from("memory").remove([path]);
  if (error) throw error;
}

/**
 * Compact list of the memories worth sending to the coach: pinned first, then
 * the newest ones. Kept short so it never crowds out the live transcript.
 */
export async function loadMemoryContext(userId: string, limit = 12): Promise<string[]> {
  try {
    const all = await listMemories(userId);
    return all.slice(0, limit).map((m) => {
      const imageTag = m.imageUrl ? " [image attached]" : "";
      return `[${m.kind}] ${m.content}${imageTag}`;
    });
  } catch {
    return [];
  }
}

/** Mark the memories that were actually fed to a suggestion as used. */
export async function touchMemories(ids: string[]) {
  if (ids.length === 0) return;
  await supabase.from("memories").update({ last_used_at: new Date().toISOString() }).in("id", ids);
}
