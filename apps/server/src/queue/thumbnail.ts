// kind:"thumbnail" — 게이트 → gpt-image(1024×1024) → 원본 JSON 저장. 섹션과 슬롯을 나눠 쓴다
import {
  OpenAiError,
  buildMainThumbnailPrompt,
  buildOptionThumbnailPrompt,
  generateThumbnailImage,
} from "@gdm/ai";
import { IMAGE_AUTO_ATTEMPT_MAX, type SectionErrorCode, type ThumbnailMessage } from "@gdm/shared";
import type { AppContext } from "../context.js";
import { claimThumbnailSlot, decideDispatch } from "../services/gate.js";
import { findJob, recomputeJobStatus } from "../services/jobs.js";
import {
  getSettings,
  markRateLimited,
  readOpenAiKey,
  readRateLimitedUntil,
} from "../services/settings.js";
import { storageKeys } from "../services/storage.js";
import { getThumbnail } from "../services/thumbnails.js";
import { updateThumbnail } from "../services/thumbnails.js";
import type { ImageOutcome } from "./image.js";
import { loadInputImages } from "./plan.js";

export async function handleThumbnail(
  ctx: AppContext,
  msg: ThumbnailMessage,
): Promise<ImageOutcome> {
  const { sql, config, storage } = ctx;
  const job = await findJob(sql, msg.userId, msg.jobId);
  if (!job) return { kind: "done" };
  const thumb = await getThumbnail(sql, msg.jobId, msg.thumbKind, msg.optionIndex);
  if (!thumb || thumb.status === "completed") return { kind: "done" };

  const patch = (p: Record<string, unknown>) =>
    updateThumbnail(sql, msg.jobId, msg.thumbKind, msg.optionIndex, {
      attempt: msg.attempt,
      ...p,
    });
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

  if (thumb.status === "failed") {
    await note(`skipped: thumbnail already failed (${thumb.error_code ?? "no code"})`);
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
      claimThumbnailSlot(sql, {
        userId: msg.userId,
        jobId: msg.jobId,
        kind: msg.thumbKind,
        optionIndex: msg.optionIndex,
        limit: settings.imageParallelism,
        attempt: msg.attempt,
      }),
  });
  if (decision.kind === "exhausted") {
    lastDetail = "gate: deferral limit reached";
    return thumb.status === "generating"
      ? { kind: "done" }
      : await fail("IMAGE_DISPATCH_EXHAUSTED");
  }
  if (decision.kind === "defer") {
    await note(`gate: deferred (${decision.reason}, retry in ${decision.delaySeconds}s)`);
    if (decision.reason === "rate_limited" && thumb.status !== "waiting_rate_limit")
      await patch({ status: "waiting_rate_limit" });
    return { kind: "defer", delaySeconds: decision.delaySeconds };
  }

  try {
    const apiKey = await readOpenAiKey(sql, config.APP_SECRET, msg.userId);
    if (!apiKey) {
      lastDetail = "no OpenAI key stored for this user";
      return await fail("API_KEY_REQUIRED");
    }

    const brief = job.brief;
    const optionNames = (brief.options ?? []).map((o) => o.name);
    const prompt =
      msg.thumbKind === "main"
        ? buildMainThumbnailPrompt({
            productName: brief.productName,
            category: brief.category,
            tone: brief.tone,
            optionNames,
          })
        : buildOptionThumbnailPrompt({
            productName: brief.productName,
            category: brief.category,
            tone: brief.tone,
            optionName: thumb.name,
          });

    await note("calling OpenAI images/edits (thumbnail)…");
    const images = await loadThumbnailReferences(ctx, msg, thumb.input_id);
    const raw = await generateThumbnailImage(apiKey, {
      prompt,
      images,
      model: config.IMAGE_MODEL,
    });
    const key = storageKeys.thumbRaw(msg.userId, msg.jobId, msg.thumbKind, msg.optionIndex);
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
      `[thumbnail] job=${msg.jobId} ${msg.thumbKind}/${msg.optionIndex} attempt=${msg.attempt} failed:`,
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
      (err.kind === "OPENAI_API_KEY_INVALID" ||
        err.kind === "IMAGE_REQUEST_REJECTED" ||
        err.kind === "OPENAI_QUOTA_EXHAUSTED")
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

/**
 * 참조 사진 고르기.
 * - 옵션 썸네일: 그 옵션 사진 1장. 없으면 주력 사진.
 * - 메인(AI 배치): 옵션 사진 전부. 없으면 주력 사진.
 */
async function loadThumbnailReferences(
  ctx: AppContext,
  msg: ThumbnailMessage,
  inputId: string | null,
) {
  if (msg.thumbKind === "option") {
    if (inputId) {
      const one = await loadInputImages(ctx, msg.jobId, { inputId });
      if (one.length > 0) return one;
    }
    return loadInputImages(ctx, msg.jobId, { role: "product" });
  }
  const options = await loadInputImages(ctx, msg.jobId, { role: "option" });
  return options.length > 0 ? options : loadInputImages(ctx, msg.jobId, { role: "product" });
}
