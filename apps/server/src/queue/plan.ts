import { OpenAiError, planSections } from "@gdm/ai";
import type { PlanMessage } from "@gdm/shared";
import type { AppContext } from "../context.js";
import { findJob, insertPlannedSections, updateJobStatus } from "../services/jobs.js";
import { readOpenAiKey } from "../services/settings.js";
import { enqueue } from "./boss.js";

/** kind:"plan" — 브리프 + 입력 이미지로 N장 설계를 만들고 image 메시지를 넣는다 */
export async function handlePlan(ctx: AppContext, msg: PlanMessage) {
  const { sql, config } = ctx;
  const job = await findJob(sql, msg.userId, msg.jobId);
  if (!job || job.status !== "queued") return;

  await updateJobStatus(sql, job.id, "planning");
  try {
    const apiKey = await readOpenAiKey(sql, config.APP_SECRET, msg.userId);
    if (!apiKey) throw new OpenAiError("OPENAI_API_KEY_INVALID", "API_KEY_REQUIRED");
    const images = await loadInputImages(ctx, job.id);
    const sections = await planSections(
      apiKey,
      { brief: job.brief, images },
      { model: config.PLAN_MODEL },
    );
    await insertPlannedSections(sql, msg.userId, job.id, sections);
    await updateJobStatus(sql, job.id, "generating");
    if (config.IMAGE_GENERATION_ENABLED) {
      for (const s of sections) {
        await enqueue(ctx, {
          kind: "image",
          userId: msg.userId,
          jobId: job.id,
          sectionIndex: s.index,
          attempt: 1,
          deferrals: 0,
        });
      }
    }
  } catch (err) {
    const detail = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error("[plan] failed", job.id, detail);
    await updateJobStatus(
      sql,
      job.id,
      "failed",
      err instanceof OpenAiError ? err.kind : "PLAN_FAILED",
      detail,
    );
  }
}

export async function loadInputImages(ctx: AppContext, jobId: string) {
  const rows = await ctx.sql<{ storage_key: string; content_type: string }[]>`
    select storage_key, content_type from job_inputs where job_id = ${jobId} and status = 'stored' order by position`;
  const images: Array<{ bytes: ArrayBuffer; contentType: string }> = [];
  for (const row of rows) {
    const buf = await ctx.storage.get(row.storage_key);
    if (!buf) throw new Error("INPUT_OBJECT_MISSING");
    const bytes = new ArrayBuffer(buf.byteLength);
    new Uint8Array(bytes).set(buf);
    images.push({ bytes, contentType: row.content_type });
  }
  return images;
}
