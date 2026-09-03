import { IMAGE_PARALLELISM_DEFAULT } from "@gdm/shared";
import type { Sql } from "../db/client.js";
import { decryptSecret, encryptSecret } from "./crypto.js";

export interface SettingsView {
  hasKey: boolean;
  lastFour: string | null;
  imageParallelism: 5 | 10;
}

export async function getSettings(sql: Sql, userId: string): Promise<SettingsView> {
  const [row] = await sql<{ openai_key_last_four: string | null; image_parallelism: number }[]>`
    select openai_key_last_four, image_parallelism from user_settings where user_id = ${userId}`;
  return {
    hasKey: typeof row?.openai_key_last_four === "string",
    lastFour: row?.openai_key_last_four ?? null,
    imageParallelism: row?.image_parallelism === 10 ? 10 : IMAGE_PARALLELISM_DEFAULT,
  };
}

export async function storeOpenAiKey(sql: Sql, appSecret: string, userId: string, key: string) {
  const lastFour = key.slice(-4);
  await sql`
    insert into user_settings (user_id, openai_key_encrypted, openai_key_last_four)
    values (${userId}, ${encryptSecret(appSecret, key)}, ${lastFour})
    on conflict (user_id) do update
      set openai_key_encrypted = excluded.openai_key_encrypted,
          openai_key_last_four = excluded.openai_key_last_four`;
  return { lastFour };
}

export async function removeOpenAiKey(sql: Sql, userId: string) {
  await sql`update user_settings set openai_key_encrypted = null, openai_key_last_four = null where user_id = ${userId}`;
}

/** 큐 컨슈머 전용. 값을 로그에 남기지 말 것. */
export async function readOpenAiKey(
  sql: Sql,
  appSecret: string,
  userId: string,
): Promise<string | null> {
  const [row] = await sql<{ openai_key_encrypted: string | null }[]>`
    select openai_key_encrypted from user_settings where user_id = ${userId}`;
  if (!row?.openai_key_encrypted) return null;
  return decryptSecret(appSecret, row.openai_key_encrypted);
}

export async function setImageParallelism(sql: Sql, userId: string, value: 5 | 10) {
  await sql`
    insert into user_settings (user_id, image_parallelism) values (${userId}, ${value})
    on conflict (user_id) do update set image_parallelism = excluded.image_parallelism`;
}

export async function readRateLimitedUntil(sql: Sql, userId: string): Promise<Date | null> {
  const [row] = await sql<{ rate_limited_until: Date | null }[]>`
    select rate_limited_until from user_settings where user_id = ${userId}`;
  return row?.rate_limited_until ?? null;
}

export async function markRateLimited(sql: Sql, userId: string, seconds: number) {
  const until = new Date(Date.now() + Math.min(Math.max(seconds, 5), 300) * 1000);
  await sql`
    insert into user_settings (user_id, rate_limited_until) values (${userId}, ${until})
    on conflict (user_id) do update set rate_limited_until = excluded.rate_limited_until`;
}
