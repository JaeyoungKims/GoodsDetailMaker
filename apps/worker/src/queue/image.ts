import { IMAGE_AUTO_ATTEMPT_MAX, type ImageMessage, type SectionErrorCode } from "@gdm/shared";
import type { AppEnv } from "../env.js";
import { createServiceClient } from "../services/supabase.js";
import { OpenAiError, generateSectionImage } from "../services/openai.js";
import { readOpenAiKey } from "../services/settings.js";
import { putObject, r2Keys } from "../services/storage.js";
import { findJob, recomputeJobStatus, type SectionRow } from "../services/jobs.js";
import { loadInputImages } from "./plan.js";

export type ImageOutcome =
  | { kind: "done" }
  | { kind: "retry"; delaySeconds: number; nextAttempt: number }
  | { kind: "failed"; code: SectionErrorCode };

/**
 * kind:"image" — 섹션 1장을 gpt-image-2 로 만들고 원본 JSON 을 R2 에 저장한다.
 * 429 는 waiting_rate_limit 로 표시하고 지연 재시도, 그 외 오류는 attempt 한도까지 재시도.
 *
 * TODO(parallelism): 사용자 설정(5|10)을 초과하지 않도록 generating 카운트를 확인하고
 * 초과 시 짧은 지연으로 되돌리는 게이트를 넣는다.
 */
export async function handleImage(env: AppEnv, msg: ImageMessage): Promise<ImageOutcome> {
  const db = createServiceClient(env);
  const job = await findJob(db, msg.userId, msg.jobId);
  if (!job) return { kind: "done" };

  const { data: section } = await db
    .from("job_sections")
    .select("*")
    .eq("job_id", msg.jobId)
    .eq("section_index", msg.sectionIndex)
    .maybeSingle<SectionRow>();
  if (!section || section.status === "completed") return { kind: "done" };

  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    db
      .from("job_sections")
      .update({ status, attempt: msg.attempt, ...extra })
      .eq("job_id", msg.jobId)
      .eq("section_index", msg.sectionIndex);

  await setStatus("generating", { error_code: null });
  try {
    const apiKey = await readOpenAiKey(db, msg.userId);
    if (!apiKey) return await fail("API_KEY_REQUIRED");

    const images = await loadInputImages(env, db, msg.jobId);
    const raw = await generateSectionImage(apiKey, { prompt: section.image_prompt, images });
    const key = r2Keys.raw(msg.userId, msg.jobId, msg.sectionIndex);
    await putObject(env, key, raw, "application/json");
    await setStatus("completed", { raw_r2_key: key, error_code: null });
    await recomputeJobStatus(db, msg.jobId);
    return { kind: "done" };
  } catch (err) {
    if (err instanceof OpenAiError && err.kind === "OPENAI_RATE_LIMIT") {
      if (msg.attempt >= IMAGE_AUTO_ATTEMPT_MAX) return await fail("IMAGE_ATTEMPT_LIMIT");
      await setStatus("waiting_rate_limit", { error_code: "OPENAI_RATE_LIMIT" });
      return {
        kind: "retry",
        delaySeconds: err.retryAfterSeconds ?? 30,
        nextAttempt: msg.attempt + 1,
      };
    }
    if (err instanceof OpenAiError && err.kind === "OPENAI_API_KEY_INVALID") {
      return await fail("OPENAI_API_KEY_INVALID");
    }
    if (err instanceof OpenAiError && err.kind === "IMAGE_REQUEST_REJECTED") {
      return await fail("IMAGE_REQUEST_REJECTED");
    }
    const code: SectionErrorCode =
      err instanceof OpenAiError
        ? err.kind
        : err instanceof Error && err.message === "INPUT_OBJECT_MISSING"
          ? "INPUT_OBJECT_MISSING"
          : "IMAGE_WORKER_FAILED";
    if (msg.attempt >= IMAGE_AUTO_ATTEMPT_MAX) return await fail("IMAGE_ATTEMPT_LIMIT");
    await setStatus("queued", { error_code: code });
    return { kind: "retry", delaySeconds: 10 * msg.attempt, nextAttempt: msg.attempt + 1 };
  }

  async function fail(code: SectionErrorCode): Promise<ImageOutcome> {
    await setStatus("failed", { error_code: code });
    await recomputeJobStatus(db, msg.jobId);
    return { kind: "failed", code };
  }
}
