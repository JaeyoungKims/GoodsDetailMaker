import { STALE_GENERATING_MINUTES } from "@gdm/shared";
import type { AppEnv } from "../env.js";
import { recomputeJobStatus } from "../services/jobs.js";
import { createServiceClient } from "../services/supabase.js";
import { deletePrefix, r2Keys } from "../services/storage.js";

/** 만료(24시간) 지난 작업 삭제 + 죽은 워커가 남긴 generating 섹션 복구. cron 15분 간격. */
export async function cleanupExpiredJobs(env: AppEnv): Promise<void> {
  const db = createServiceClient(env);
  await recoverStaleSections(db);
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

/**
 * 너무 오래 generating 인 섹션은 워커가 죽은 것으로 보고 실패 처리한다.
 * 그대로 두면 동시 생성 슬롯을 계속 차지한다(게이트는 이미 무시하지만 화면에는 "만드는 중"으로 남는다).
 */
export async function recoverStaleSections(
  db: ReturnType<typeof createServiceClient>,
): Promise<number> {
  const cutoff = new Date(Date.now() - STALE_GENERATING_MINUTES * 60 * 1000).toISOString();
  const { data } = await db
    .from("job_sections")
    .update({ status: "failed", error_code: "IMAGE_WORKER_FAILED" })
    .eq("status", "generating")
    .lt("updated_at", cutoff)
    .select("job_id");
  const jobIds = [...new Set((data ?? []).map((r) => r.job_id as string))];
  for (const jobId of jobIds) await recomputeJobStatus(db, jobId);
  return data?.length ?? 0;
}
