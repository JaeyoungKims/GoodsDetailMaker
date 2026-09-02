import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_PARALLELISM_DEFAULT } from "@gdm/shared";

/**
 * user_settings + Supabase Vault.
 * 키 원문은 DB 함수(security definer)를 통해서만 Vault 에 넣고 꺼낸다.
 * 함수 정의는 supabase/migrations 참고.
 */
export async function storeOpenAiKey(
  db: SupabaseClient,
  userId: string,
  key: string,
): Promise<{ lastFour: string }> {
  const { data, error } = await db.rpc("set_openai_key", { p_user_id: userId, p_key: key });
  if (error) throw new Error(`VAULT_UNAVAILABLE: ${error.message}`);
  return { lastFour: String(data) };
}

export async function removeOpenAiKey(db: SupabaseClient, userId: string): Promise<void> {
  const { error } = await db.rpc("delete_openai_key", { p_user_id: userId });
  if (error) throw new Error(`VAULT_UNAVAILABLE: ${error.message}`);
}

/** 큐 컨슈머 전용. 응답을 로그에 남기지 말 것. */
export async function readOpenAiKey(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await db.rpc("get_openai_key", { p_user_id: userId });
  if (error) throw new Error(`VAULT_UNAVAILABLE: ${error.message}`);
  return typeof data === "string" && data.length > 0 ? data : null;
}

export async function getSettings(
  db: SupabaseClient,
  userId: string,
): Promise<{ hasKey: boolean; lastFour: string | null; imageParallelism: 5 | 10 }> {
  const { data, error } = await db
    .from("user_settings")
    .select("openai_key_last_four, image_parallelism")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const parallelism = data?.image_parallelism === 10 ? 10 : IMAGE_PARALLELISM_DEFAULT;
  return {
    hasKey: typeof data?.openai_key_last_four === "string",
    lastFour: data?.openai_key_last_four ?? null,
    imageParallelism: parallelism,
  };
}

export async function setImageParallelism(
  db: SupabaseClient,
  userId: string,
  value: 5 | 10,
): Promise<void> {
  const { error } = await db
    .from("user_settings")
    .upsert({ user_id: userId, image_parallelism: value }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}
