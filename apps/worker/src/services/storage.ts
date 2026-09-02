import type { AppEnv } from "../env.js";

/** R2 키 규칙. 사용자·작업 단위로 접두사를 두어 만료 정리와 용량 집계를 단순하게 한다. */
export const r2Keys = {
  input: (userId: string, jobId: string, inputId: string) =>
    `users/${userId}/jobs/${jobId}/inputs/${inputId}.jpg`,
  raw: (userId: string, jobId: string, sectionIndex: number) =>
    `users/${userId}/jobs/${jobId}/raw/${String(sectionIndex).padStart(2, "0")}.json`,
  jobPrefix: (userId: string, jobId: string) => `users/${userId}/jobs/${jobId}/`,
};

export async function putObject(
  env: AppEnv,
  key: string,
  body: ReadableStream | ArrayBuffer | string,
  contentType: string,
): Promise<void> {
  await env.ARTIFACTS.put(key, body, { httpMetadata: { contentType } });
}

export async function getObject(env: AppEnv, key: string): Promise<R2ObjectBody | null> {
  return env.ARTIFACTS.get(key);
}

/** 작업 접두사 아래 객체를 모두 지운다 (만료 정리용) */
export async function deletePrefix(env: AppEnv, prefix: string): Promise<number> {
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const page = await env.ARTIFACTS.list(cursor ? { prefix, cursor } : { prefix });
    const keys = page.objects.map((o) => o.key);
    if (keys.length > 0) {
      await env.ARTIFACTS.delete(keys);
      deleted += keys.length;
    }
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return deleted;
}
