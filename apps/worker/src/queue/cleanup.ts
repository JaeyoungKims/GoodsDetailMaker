import type { AppEnv } from "../env.js";
import { createServiceClient } from "../services/supabase.js";
import { deletePrefix, r2Keys } from "../services/storage.js";

/** 만료(24시간) 지난 작업의 R2 객체와 DB 행을 지운다. cron 15분 간격. */
export async function cleanupExpiredJobs(env: AppEnv): Promise<void> {
  const db = createServiceClient(env);
  const { data: expired } = await db
    .from("jobs")
    .select("id, user_id")
    .lt("expires_at", new Date().toISOString())
    .limit(50);
  for (const job of expired ?? []) {
    await deletePrefix(env, r2Keys.jobPrefix(job.user_id, job.id));
    await db.from("jobs").delete().eq("id", job.id); // job_inputs / job_sections 는 cascade
  }
}
