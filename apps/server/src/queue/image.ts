import { OpenAiError, generateSectionImage, refineImagePrompt } from "@gdm/ai";
import { IMAGE_AUTO_ATTEMPT_MAX, type ImageMessage, type SectionErrorCode } from "@gdm/shared";
import type { AppContext } from "../context.js";
import { claimImageSlot, decideDispatch } from "../services/gate.js";
import { findJob, getSection, recomputeJobStatus, updateSection } from "../services/jobs.js";
import {
  getSettings,
  markRateLimited,
  readOpenAiKey,
  readRateLimitedUntil,
} from "../services/settings.js";
import { storageKeys } from "../services/storage.js";
import { loadInputImages } from "./plan.js";

export type ImageOutcome =
  | { kind: "done" }
  | { kind: "retry"; delaySeconds: number; nextAttempt: number }
  | { kind: "defer"; delaySeconds: number }
  | { kind: "failed"; code: SectionErrorCode };

/** kind:"image" — 게이트 → (피드백 반영) → gpt-image → 원본 JSON 저장 → 상태 갱신 */
export async function handleImage(ctx: AppContext, msg: ImageMessage): Promise<ImageOutcome> {
  const { sql, config, storage } = ctx;
  const job = await findJob(sql, msg.userId, msg.jobId);
  if (!job) return { kind: "done" };
  const section = await getSection(sql, msg.jobId, msg.sectionIndex);
  if (!section || section.status === "completed") return { kind: "done" };

  const patch = (p: Record<string, unknown>) =>
    updateSection(sql, msg.jobId, msg.sectionIndex, { attempt: msg.attempt, ...p });
  const note = (text: string) =>
    patch({
      error_detail: `[attempt ${msg.attempt}, deferrals ${msg.deferrals}] ${text}`.slice(0, 500),
    });
  let lastDetail: string | null = null;
  const fail = async (code: SectionErrorCode): Promise<ImageOutcome> => {
    await patch({ status: "failed", error_code: code, error_detail: lastDetail });
    await recomputeJobStatus(sql, msg.jobId);
    return { kind: "failed", code };
  };

  if (section.status === "failed") {
    await note(`skipped: section already failed (${section.error_code ?? "no code"})`);
    return { kind: "done" };
  }

  const [settings, rateLimitedUntil] = await Promise.all([
    getSettings(sql, msg.userId),
    readRateLimitedUntil(sql, msg.userId),
  ]);
  const decision = await decideDispatch({
    deferrals: msg.deferrals,
    rateLimitedUntil,
    claimSlot: () =>
      claimImageSlot(sql, {
        userId: msg.userId,
        jobId: msg.jobId,
        sectionIndex: msg.sectionIndex,
        limit: settings.imageParallelism,
        attempt: msg.attempt,
      }),
  });
  if (decision.kind === "exhausted") {
    lastDetail = "gate: deferral limit reached";
    return section.status === "generating"
      ? { kind: "done" }
      : await fail("IMAGE_DISPATCH_EXHAUSTED");
  }
  if (decision.kind === "defer") {
    await note(
      `gate: deferred (${decision.reason}, retry in ${decision.delaySeconds}s, parallelism ${settings.imageParallelism})`,
    );
    if (decision.reason === "rate_limited" && section.status !== "waiting_rate_limit")
      await patch({ status: "waiting_rate_limit" });
    return { kind: "defer", delaySeconds: decision.delaySeconds };
  }

  try {
    const apiKey = await readOpenAiKey(sql, config.APP_SECRET, msg.userId);
    if (!apiKey) {
      lastDetail = "no OpenAI key stored for this user";
      return await fail("API_KEY_REQUIRED");
    }

    let prompt = section.image_prompt;
    const feedback = section.feedback?.trim();
    if (feedback) {
      await note("applying feedback to prompt…");
      try {
        prompt = await refineImagePrompt(apiKey, {
          imagePrompt: section.image_prompt,
          visualDirection: section.visual_direction,
          headline: section.headline,
          feedback,
          model: config.PLAN_MODEL,
        });
      } catch (err) {
        console.warn(
          "[image] refine failed, appending feedback verbatim",
          err instanceof Error ? err.message : err,
        );
        prompt = `${section.image_prompt}\n\nRevision notes from the seller (Korean, must be applied): ${feedback}`;
      }
      await patch({
        image_prompt: prompt,
        feedback: null,
        feedback_history: [
          ...(section.feedback_history ?? []),
          { note: feedback, appliedAt: new Date().toISOString() },
        ],
      });
    }

    await note("calling OpenAI images/edits…");
    const images = await loadInputImages(ctx, msg.jobId);
    const raw = await generateSectionImage(apiKey, { prompt, images, model: config.IMAGE_MODEL });
    const key = storageKeys.raw(msg.userId, msg.jobId, msg.sectionIndex);
    await storage.put(key, raw);
    await patch({
      status: "completed",
      raw_storage_key: key,
      raw_bytes: Buffer.byteLength(raw),
      error_code: null,
      error_detail: null,
    });
    await recomputeJobStatus(sql, msg.jobId);
    return { kind: "done" };
  } catch (err) {
    const detail = (err instanceof Error ? err.message : String(err)).slice(0, 500);
    console.error(
      `[image] job=${msg.jobId} section=${msg.sectionIndex} attempt=${msg.attempt} failed:`,
      err instanceof OpenAiError ? `${err.kind} ${detail}` : detail,
    );
    lastDetail = detail;
    if (err instanceof OpenAiError && err.kind === "OPENAI_RATE_LIMIT") {
      if (msg.attempt >= IMAGE_AUTO_ATTEMPT_MAX) return await fail("IMAGE_ATTEMPT_LIMIT");
      const wait = err.retryAfterSeconds ?? 30;
      await Promise.all([
        patch({ status: "waiting_rate_limit", error_code: "OPENAI_RATE_LIMIT" }),
        markRateLimited(sql, msg.userId, wait),
      ]);
      return { kind: "retry", delaySeconds: wait, nextAttempt: msg.attempt + 1 };
    }
    if (
      err instanceof OpenAiError &&
      (err.kind === "OPENAI_API_KEY_INVALID" || err.kind === "IMAGE_REQUEST_REJECTED")
    ) {
      return await fail(err.kind);
    }
    const code: SectionErrorCode =
      err instanceof OpenAiError
        ? err.kind
        : err instanceof Error && err.message === "INPUT_OBJECT_MISSING"
          ? "INPUT_OBJECT_MISSING"
          : "IMAGE_WORKER_FAILED";
    if (msg.attempt >= IMAGE_AUTO_ATTEMPT_MAX) return await fail("IMAGE_ATTEMPT_LIMIT");
    await patch({ status: "queued", error_code: code, error_detail: detail });
    return { kind: "retry", delaySeconds: 10 * msg.attempt, nextAttempt: msg.attempt + 1 };
  }
}
