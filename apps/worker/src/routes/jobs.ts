import { Hono, type Context } from "hono";
import { z } from "zod";
import {
  INPUT_IMAGE_MAX,
  INPUT_IMAGE_MAX_BYTES,
  INPUT_IMAGE_TOTAL_MAX_BYTES,
  INPUT_IMAGE_TYPES,
  RAW_RESERVE_BYTES_PER_SECTION,
  SECTION_COUNT,
  SECTION_MANUAL_RETRY_MAX,
  UPLOAD_ATTEMPT_MAX,
  productBriefSchema,
  sectionCopyUpdateSchema,
} from "@gdm/shared";
import { imageGenerationEnabled, type HonoEnv } from "../env.js";
import { ApiError } from "../lib/errors.js";
import { createServiceClient } from "../services/supabase.js";
import { deletePrefix, getObject, putObject, r2Keys } from "../services/storage.js";
import { getSettings } from "../services/settings.js";
import { assertJobLimits, assertStorageQuota } from "../services/limits.js";
import { findJob, listSections, toJob, toSection, type SectionRow } from "../services/jobs.js";

const uuid = z.uuid();
const sectionIndexParam = z.coerce.number().int().min(1).max(13);

async function requireJob(c: Context<HonoEnv>) {
  const jobId = uuid.safeParse(c.req.param("jobId"));
  if (!jobId.success) throw new ApiError("JOB_NOT_FOUND", 404);
  const db = createServiceClient(c.env);
  const job = await findJob(db, c.get("user").id, jobId.data);
  if (!job) throw new ApiError("JOB_NOT_FOUND", 404);
  if (new Date(job.expires_at).getTime() < Date.now()) throw new ApiError("JOB_EXPIRED", 410);
  return { db, job };
}

async function discardDrafts(
  db: ReturnType<typeof createServiceClient>,
  env: HonoEnv["Bindings"],
  userId: string,
) {
  const { data: drafts } = await db
    .from("jobs")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "draft");
  for (const draft of drafts ?? []) {
    await deletePrefix(env, r2Keys.jobPrefix(userId, draft.id as string)).catch(() => 0);
    await db.from("jobs").delete().eq("id", draft.id); // job_inputs 는 cascade
  }
}

export const jobRoutes = new Hono<HonoEnv>()
  /**
   * 초안 생성. 클라이언트가 만든 UUID 를 Idempotency-Key 로 받아 같은 요청을 재시도해도 안전하다.
   */
  .post("/", async (c) => {
    const idempotencyKey = uuid.safeParse(c.req.header("Idempotency-Key"));
    if (!idempotencyKey.success) throw new ApiError("JOB_CREATE_CONFLICT", 400);
    const brief = productBriefSchema.safeParse(await c.req.json().catch(() => null));
    if (!brief.success) throw new ApiError("INVALID_PRODUCT_BRIEF", 400);

    const user = c.get("user");
    const db = createServiceClient(c.env);

    const settings = await getSettings(db, user.id);
    if (!settings.hasKey) throw new ApiError("API_KEY_REQUIRED", 412);

    const existing = await findJob(db, user.id, idempotencyKey.data);
    if (existing) return c.json({ id: existing.id });

    // 새 작업을 만든다는 건 이전 초안을 포기했다는 뜻이다. 남아 있는 초안과 업로드 파일을 정리한다.
    await discardDrafts(db, c.env, user.id);
    await assertJobLimits(db, user.id);
    const { error } = await db.from("jobs").insert({
      id: idempotencyKey.data,
      user_id: user.id,
      status: "draft",
      product_name: brief.data.productName,
      brief: brief.data,
      story_order: brief.data.storyOrder,
    });
    if (error) throw new ApiError("JOB_CREATE_CONFLICT", 409);
    return c.json({ id: idempotencyKey.data }, 201);
  })

  /** 입력 이미지 업로드 (정규화된 JPEG 1장). body 를 그대로 R2 에 스트리밍한다. */
  .put("/:jobId/inputs/:inputId", async (c) => {
    const { db, job } = await requireJob(c);
    if (job.status !== "draft") throw new ApiError("JOB_NOT_UPLOADABLE", 409);
    const inputId = uuid.safeParse(c.req.param("inputId"));
    if (!inputId.success) throw new ApiError("INVALID_IMAGE", 400);

    const size = Number(c.req.header("x-file-size") ?? "0");
    const contentType = c.req.header("Content-Type") ?? "";
    const mime = contentType.split(";")[0]!.trim().toLowerCase();
    if (
      !(INPUT_IMAGE_TYPES as readonly string[]).includes(mime) ||
      !Number.isInteger(size) ||
      size < 1
    ) {
      throw new ApiError("INVALID_IMAGE", 400);
    }
    if (size > INPUT_IMAGE_MAX_BYTES) throw new ApiError("JOB_INPUT_BYTES_LIMIT", 413);

    const { data: inputs, error: listError } = await db
      .from("job_inputs")
      .select("id, byte_size, upload_attempts")
      .eq("job_id", job.id);
    if (listError) throw new ApiError("INTERNAL_ERROR", 500);
    const existing = (inputs ?? []).find((i) => i.id === inputId.data);
    const others = (inputs ?? []).filter((i) => i.id !== inputId.data);
    if (others.length >= INPUT_IMAGE_MAX) throw new ApiError("JOB_INPUT_LIMIT", 409);
    const total = others.reduce((sum, i) => sum + Number(i.byte_size), 0) + size;
    if (total > INPUT_IMAGE_TOTAL_MAX_BYTES) throw new ApiError("JOB_INPUT_BYTES_LIMIT", 413);
    const attempts = Number(existing?.upload_attempts ?? 0);
    if (attempts >= UPLOAD_ATTEMPT_MAX) throw new ApiError("JOB_UPLOAD_ATTEMPT_LIMIT", 429);
    // 같은 inputId 재업로드는 이전 크기를 빼고 계산한다
    await assertStorageQuota(db, job.user_id, size - Number(existing?.byte_size ?? 0));

    const key = r2Keys.input(job.user_id, job.id, inputId.data, mime);
    const body = c.req.raw.body;
    if (!body) throw new ApiError("INVALID_IMAGE", 400);
    await putObject(c.env, key, body, mime);

    const { error } = await db.from("job_inputs").upsert(
      {
        id: inputId.data,
        job_id: job.id,
        user_id: job.user_id,
        position: others.length,
        r2_key: key,
        content_type: mime,
        byte_size: size,
        status: "stored",
        upload_attempts: attempts + 1,
      },
      { onConflict: "id" },
    );
    if (error) throw new ApiError("JOB_INPUT_CONFLICT", 409);
    return c.json({ stored: true as const });
  })

  /** 생성 시작: draft → queued, plan 메시지 enqueue */
  .post("/:jobId/start", async (c) => {
    const { db, job } = await requireJob(c);
    if (job.status !== "draft") throw new ApiError("JOB_NOT_STARTABLE", 409);
    const { count } = await db
      .from("job_inputs")
      .select("id", { count: "exact", head: true })
      .eq("job_id", job.id)
      .eq("status", "stored");
    if (!count) throw new ApiError("PRODUCT_IMAGE_REQUIRED", 412);

    // 원본 응답 13장분 공간을 미리 예약한다. 한도에 걸리면 시작하지 않는다.
    const reserved = SECTION_COUNT * RAW_RESERVE_BYTES_PER_SECTION;
    await assertStorageQuota(db, job.user_id, reserved);

    const { error } = await db
      .from("jobs")
      .update({ status: "queued", reserved_bytes: reserved })
      .eq("id", job.id);
    if (error) throw new ApiError("INTERNAL_ERROR", 500);
    try {
      await c.env.JOB_QUEUE.send({ kind: "plan", userId: job.user_id, jobId: job.id });
    } catch {
      await db.from("jobs").update({ status: "draft", reserved_bytes: 0 }).eq("id", job.id);
      throw new ApiError("QUEUE_UNAVAILABLE", 503);
    }
    return c.json({ queued: true as const });
  })

  .get("/:jobId", async (c) => {
    const { db, job } = await requireJob(c);
    const sections = await listSections(db, job.id);
    return c.json(toJob(job, sections, imageGenerationEnabled(c.env)));
  })

  /** 실패했거나 마음에 들지 않는 한 장만 다시 만든다 (수동 재시도 횟수 제한) */
  .post("/:jobId/sections/:sectionIndex/retry", async (c) => {
    const { db, job } = await requireJob(c);
    const index = sectionIndexParam.safeParse(c.req.param("sectionIndex"));
    if (!index.success) throw new ApiError("SECTION_NOT_FOUND", 404);

    const { data: section } = await db
      .from("job_sections")
      .select("*")
      .eq("job_id", job.id)
      .eq("section_index", index.data)
      .maybeSingle<SectionRow>();
    if (!section) throw new ApiError("SECTION_NOT_FOUND", 404);
    if (section.status === "generating" || section.status === "queued") {
      throw new ApiError("SECTION_NOT_RETRYABLE", 409);
    }
    if (section.manual_retries >= SECTION_MANUAL_RETRY_MAX) {
      throw new ApiError("SECTION_MANUAL_RETRY_LIMIT", 429);
    }

    const { error } = await db
      .from("job_sections")
      .update({
        status: "queued",
        error_code: null,
        error_detail: null,
        attempt: 0,
        manual_retries: section.manual_retries + 1,
      })
      .eq("job_id", job.id)
      .eq("section_index", index.data);
    if (error) throw new ApiError("INTERNAL_ERROR", 500);

    const enabled = imageGenerationEnabled(c.env);
    if (enabled) {
      await c.env.JOB_QUEUE.send({
        kind: "image",
        userId: job.user_id,
        jobId: job.id,
        sectionIndex: index.data,
        attempt: 1,
      });
    }
    return c.json({
      queued: true as const,
      sectionIndex: index.data,
      imageGenerationEnabled: enabled,
    });
  })

  /** 카피 편집 (낙관적 잠금). 이미지 비용 없음. */
  .patch("/:jobId/sections/:sectionIndex/copy", async (c) => {
    const { db, job } = await requireJob(c);
    const index = sectionIndexParam.safeParse(c.req.param("sectionIndex"));
    if (!index.success) throw new ApiError("SECTION_NOT_FOUND", 404);
    const body = sectionCopyUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("INVALID_SECTION_COPY", 400);

    const { data: updated, error } = await db
      .from("job_sections")
      .update({
        headline: body.data.headline,
        subheadline: body.data.subheadline,
        bullets: body.data.bullets,
        copy_version: body.data.expectedCopyVersion + 1,
      })
      .eq("job_id", job.id)
      .eq("section_index", index.data)
      .eq("copy_version", body.data.expectedCopyVersion)
      .select("*")
      .maybeSingle<SectionRow>();
    if (error) throw new ApiError("INTERNAL_ERROR", 500);
    if (updated) return c.json({ updated: true as const, section: toSection(updated) });

    const { data: current } = await db
      .from("job_sections")
      .select("copy_version")
      .eq("job_id", job.id)
      .eq("section_index", index.data)
      .maybeSingle<{ copy_version: number }>();
    if (!current) throw new ApiError("SECTION_NOT_FOUND", 404);
    throw new ApiError("COPY_VERSION_CONFLICT", 409, { currentCopyVersion: current.copy_version });
  })

  /** OpenAI 원본 응답 JSON 프록시. 클라이언트가 디코드·합성한다. */
  .get("/:jobId/sections/:sectionIndex/raw", async (c) => {
    const { job } = await requireJob(c);
    const index = sectionIndexParam.safeParse(c.req.param("sectionIndex"));
    if (!index.success) throw new ApiError("SECTION_NOT_FOUND", 404);
    const object = await getObject(c.env, r2Keys.raw(job.user_id, job.id, index.data));
    if (!object) throw new ApiError("ARTIFACT_NOT_FOUND", 404);
    return new Response(object.body, {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(object.size),
        "Cache-Control": "private, no-store",
      },
    });
  });
