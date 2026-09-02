import { IMAGE_AUTO_ATTEMPT_MAX, type ImageMessage, type SectionErrorCode } from "@gdm/shared";
import {
  claimImageSlot,
  decideDispatch,
  markRateLimited,
  readRateLimitedUntil,
} from "../services/gate.js";
import { getSettings } from "../services/settings.js";
import type { AppEnv } from "../env.js";
import { createServiceClient } from "../services/supabase.js";
import { OpenAiError, generateSectionImage } from "../services/openai.js";
import { readOpenAiKey } from "../services/settings.js";
import { putObject, r2Keys } from "../services/storage.js";
import { findJob, recomputeJobStatus, type SectionRow } from "../services/jobs.js";
import { loadInputImages } from "./plan.js";

export type ImageOutcome =
  | { kind: "done" }
  /** OpenAI 호출 실패 후 재시도 (attempt 소모) */
  | { kind: "retry"; delaySeconds: number; nextAttempt: number }
  /** 게이트·감속 때문에 미룸 (attempt 유지, deferrals 증가) */
  | { kind: "defer"; delaySeconds: number }
  | { kind: "failed"; code: SectionErrorCode };

/**
 * kind:"image" — 섹션 1장을 gpt-image-2 로 만들고 원본 JSON 을 R2 에 저장한다.
 * 429 는 waiting_rate_limit 로 표시하고 지연 재시도, 그 외 오류는 attempt 한도까지 재시도.
 * 호출 전에 사용자 동시 생성 한도(5|10)와 감속 상태를 확인하는 게이트를 지난다.
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
  // 재시도 라우트는 queued 로 되돌린 뒤 넣으므로, 여기서 보이는 failed 는 다른 경로(크론·다른 attempt)가 끝낸 것
  if (section.status === "failed") return { kind: "done" };

  const setStatus = (status: string, extra: Record<string, unknown> = {}) =>
    db
      .from("job_sections")
      .update({ status, attempt: msg.attempt, ...extra })
      .eq("job_id", msg.jobId)
      .eq("section_index", msg.sectionIndex);

  // ── 게이트: 감속 중이거나 슬롯이 없으면 미룬다 ──
  const [settings, rateLimitedUntil] = await Promise.all([
    getSettings(db, msg.userId),
    readRateLimitedUntil(db, msg.userId),
  ]);
  const decision = await decideDispatch({
    deferrals: msg.deferrals,
    rateLimitedUntil,
    claimSlot: () =>
      claimImageSlot(db, {
        userId: msg.userId,
        jobId: msg.jobId,
        sectionIndex: msg.sectionIndex,
        limit: settings.imageParallelism,
        attempt: msg.attempt,
      }),
  });
  if (decision.kind === "exhausted") {
    // 다른 워커가 실제로 처리 중이면 그쪽 결과에 맡긴다
    return section.status === "generating"
      ? { kind: "done" }
      : await fail("IMAGE_DISPATCH_EXHAUSTED");
  }
  if (decision.kind === "defer") {
    if (decision.reason === "rate_limited" && section.status !== "waiting_rate_limit") {
      await db
        .from("job_sections")
        .update({ status: "waiting_rate_limit" })
        .eq("job_id", msg.jobId)
        .eq("section_index", msg.sectionIndex);
    }
    return { kind: "defer", delaySeconds: decision.delaySeconds };
  }
  // claim_image_slot 이 status=generating, attempt 를 이미 기록했다.

  try {
    const apiKey = await readOpenAiKey(db, msg.userId);
    if (!apiKey) return await fail("API_KEY_REQUIRED");

    const images = await loadInputImages(env, db, msg.jobId);
    const raw = await generateSectionImage(apiKey, { prompt: section.image_prompt, images });
    const key = r2Keys.raw(msg.userId, msg.jobId, msg.sectionIndex);
    await putObject(env, key, raw, "application/json");
    await setStatus("completed", {
      raw_r2_key: key,
      raw_bytes: new TextEncoder().encode(raw).byteLength,
      error_code: null,
    });
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
