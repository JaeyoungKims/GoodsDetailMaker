import type { PlanMessage } from "@gdm/shared";
import type { AppEnv } from "../env.js";
import { createServiceClient } from "../services/supabase.js";
import { OpenAiError, planSections } from "../services/openai.js";
import { readOpenAiKey } from "../services/settings.js";
import { getObject } from "../services/storage.js";
import { findJob, insertPlannedSections, updateJobStatus } from "../services/jobs.js";
import { imageGenerationEnabled } from "../env.js";

/**
 * kind:"plan" — 브리프 + 입력 이미지로 13장 설계를 만들고, image 메시지 13개를 넣는다.
 * 실패 시 jobs.status = failed 로 기록한다(기획은 자동 재시도하지 않음).
 */
export async function handlePlan(env: AppEnv, msg: PlanMessage): Promise<void> {
  const db = createServiceClient(env);
  const job = await findJob(db, msg.userId, msg.jobId);
  if (!job || job.status !== "queued") return; // 중복·지연 메시지는 무시

  await updateJobStatus(db, job.id, "planning");
  try {
    const apiKey = await readOpenAiKey(db, msg.userId);
    if (!apiKey) throw new OpenAiError("OPENAI_API_KEY_INVALID", "API_KEY_REQUIRED");

    const images = await loadInputImages(env, db, job.id);
    const sections = await planSections(apiKey, { brief: job.brief, images });
    await insertPlannedSections(db, msg.userId, job.id, sections);
    await updateJobStatus(db, job.id, "generating");

    if (imageGenerationEnabled(env)) {
      await env.JOB_QUEUE.sendBatch(
        sections.map((s) => ({
          body: {
            kind: "image",
            userId: msg.userId,
            jobId: job.id,
            sectionIndex: s.index,
            attempt: 1,
          },
        })),
      );
    }
  } catch (err) {
    console.error("plan failed", job.id, err instanceof Error ? err.message : err);
    await db
      .from("jobs")
      .update({
        status: "failed",
        error_code: err instanceof OpenAiError ? err.kind : "PLAN_FAILED",
      })
      .eq("id", job.id);
  }
}

export async function loadInputImages(
  env: AppEnv,
  db: ReturnType<typeof createServiceClient>,
  jobId: string,
): Promise<Array<{ bytes: ArrayBuffer; contentType: string }>> {
  const { data } = await db
    .from("job_inputs")
    .select("r2_key, content_type")
    .eq("job_id", jobId)
    .eq("status", "stored")
    .order("position");
  const images: Array<{ bytes: ArrayBuffer; contentType: string }> = [];
  for (const row of data ?? []) {
    const object = await getObject(env, row.r2_key);
    if (!object) throw new Error("INPUT_OBJECT_MISSING");
    images.push({ bytes: await object.arrayBuffer(), contentType: row.content_type });
  }
  return images;
}
