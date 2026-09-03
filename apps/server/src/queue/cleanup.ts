import { STALE_GENERATING_MINUTES } from "@gdm/shared";
import type { AppContext } from "../context.js";
import { recomputeJobStatus } from "../services/jobs.js";
import { storageKeys } from "../services/storage.js";

/** 만료된 작업 삭제(expires_at 이 있는 것만) + 죽은 워커가 남긴 generating 복구 + 만료 세션 정리 */
export async function cleanupExpiredJobs(ctx: AppContext) {
  const { sql, storage } = ctx;
  const cutoff = new Date(Date.now() - STALE_GENERATING_MINUTES * 60 * 1000);
  const stale = await sql<{ job_id: string }[]>`
    update job_sections set status = 'failed', error_code = 'IMAGE_WORKER_FAILED'
     where status = 'generating' and updated_at < ${cutoff} returning job_id`;
  for (const jobId of new Set(stale.map((r) => r.job_id))) await recomputeJobStatus(sql, jobId);

  const expired = await sql<{ id: string; user_id: string }[]>`
    select id, user_id from jobs where expires_at is not null and expires_at < now() limit 50`;
  for (const job of expired) {
    await storage.deletePrefix(storageKeys.jobPrefix(job.user_id, job.id));
    await sql`delete from jobs where id = ${job.id}`;
  }
  await sql`delete from sessions where expires_at < now()`;
}
