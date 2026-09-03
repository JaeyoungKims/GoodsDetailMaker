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
  sectionFeedbackSchema,
  sniffImageType,
} from "@gdm/shared";
import type { HonoEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import { enqueue } from "../queue/boss.js";
import {
  findJob,
  getSection,
  listSections,
  toJob,
  toSection,
  type SectionRow,
} from "../services/jobs.js";
import { assertJobLimits, assertStorageQuota } from "../services/limits.js";
import { getSettings } from "../services/settings.js";
import { storageKeys } from "../services/storage.js";

const uuid = z.uuid();
const sectionIndexParam = z.coerce.number().int().min(1).max(SECTION_COUNT);

async function requireJob(c: Context<HonoEnv>) {
  const { sql } = c.get("ctx");
  const jobId = uuid.safeParse(c.req.param("jobId"));
  if (!jobId.success) throw new ApiError("JOB_NOT_FOUND", 404);
  const job = await findJob(sql, c.get("user").id, jobId.data);
  if (!job) throw new ApiError("JOB_NOT_FOUND", 404);
  if (job.expires_at && job.expires_at.getTime() < Date.now())
    throw new ApiError("JOB_EXPIRED", 410);
  return { sql, job };
}

function sectionIndex(c: Context<HonoEnv>): number {
  const index = sectionIndexParam.safeParse(c.req.param("sectionIndex"));
  if (!index.success) throw new ApiError("SECTION_NOT_FOUND", 404);
  return index.data;
}

export const jobRoutes = new Hono<HonoEnv>()
  /** 초안 생성 (Idempotency-Key = 클라이언트 UUID). 이전 초안은 정리한다. */
  .post("/", async (c) => {
    const { sql, storage } = c.get("ctx");
    const user = c.get("user");
    const idempotencyKey = uuid.safeParse(c.req.header("Idempotency-Key"));
    if (!idempotencyKey.success) throw new ApiError("JOB_CREATE_CONFLICT", 400);
    const brief = productBriefSchema.safeParse(await c.req.json().catch(() => null));
    if (!brief.success) throw new ApiError("INVALID_PRODUCT_BRIEF", 400);

    const settings = await getSettings(sql, user.id);
    if (!settings.hasKey) throw new ApiError("API_KEY_REQUIRED", 412);
    const existing = await findJob(sql, user.id, idempotencyKey.data);
    if (existing) return c.json({ id: existing.id });

    const drafts = await sql<
      { id: string }[]
    >`select id from jobs where user_id = ${user.id} and status = 'draft'`;
    for (const d of drafts) {
      await storage.deletePrefix(storageKeys.jobPrefix(user.id, d.id)).catch(() => {});
      await sql`delete from jobs where id = ${d.id}`;
    }
    await assertJobLimits(sql, user.id);

    const retentionDays = c.get("ctx").config.JOB_RETENTION_DAYS;
    const expiresAt =
      retentionDays > 0 ? new Date(Date.now() + retentionDays * 24 * 60 * 60 * 1000) : null;
    await sql`
      insert into jobs (id, user_id, status, product_name, brief, story_order, section_count, expires_at)
      values (${idempotencyKey.data}, ${user.id}, 'draft', ${brief.data.productName}, ${sql.json(brief.data as never)},
              ${brief.data.storyOrder}, ${brief.data.storyOrder.length}, ${expiresAt})`;
    return c.json({ id: idempotencyKey.data }, 201);
  })

  /** 입력 이미지 업로드. 본문을 읽어 시그니처·길이를 검증한 뒤 디스크에 저장 */
  .put("/:jobId/inputs/:inputId", async (c) => {
    const { sql, job } = await requireJob(c);
    const { storage } = c.get("ctx");
    if (job.status !== "draft") throw new ApiError("JOB_NOT_UPLOADABLE", 409);
    const inputId = uuid.safeParse(c.req.param("inputId"));
    if (!inputId.success) throw new ApiError("INVALID_IMAGE", 400);

    const size = Number(c.req.header("x-file-size") ?? "0");
    const mime = (c.req.header("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
    if (
      !(INPUT_IMAGE_TYPES as readonly string[]).includes(mime) ||
      !Number.isInteger(size) ||
      size < 1
    ) {
      throw new ApiError("INVALID_IMAGE", 400);
    }
    if (size > INPUT_IMAGE_MAX_BYTES) throw new ApiError("JOB_INPUT_BYTES_LIMIT", 413);

    const inputs = await sql<{ id: string; byte_size: number; upload_attempts: number }[]>`
      select id, byte_size, upload_attempts from job_inputs where job_id = ${job.id}`;
    const existing = inputs.find((i) => i.id === inputId.data);
    const others = inputs.filter((i) => i.id !== inputId.data);
    if (others.length >= INPUT_IMAGE_MAX) throw new ApiError("JOB_INPUT_LIMIT", 409);
    if (others.reduce((s, i) => s + Number(i.byte_size), 0) + size > INPUT_IMAGE_TOTAL_MAX_BYTES) {
      throw new ApiError("JOB_INPUT_BYTES_LIMIT", 413);
    }
    const attempts = Number(existing?.upload_attempts ?? 0);
    if (attempts >= UPLOAD_ATTEMPT_MAX) throw new ApiError("JOB_UPLOAD_ATTEMPT_LIMIT", 429);
    await assertStorageQuota(sql, job.user_id, size - Number(existing?.byte_size ?? 0));

    const bytes = new Uint8Array(await c.req.raw.arrayBuffer());
    if (bytes.byteLength !== size) throw new ApiError("INVALID_IMAGE", 400);
    const sniffed = sniffImageType(bytes);
    if (sniffed !== mime)
      throw new ApiError("INVALID_IMAGE", 400, {
        detail: `declared ${mime} but content is ${sniffed}`,
      });

    const key = storageKeys.input(job.user_id, job.id, inputId.data, mime);
    await storage.put(key, bytes);
    await sql`
      insert into job_inputs (id, job_id, user_id, position, storage_key, content_type, byte_size, status, upload_attempts)
      values (${inputId.data}, ${job.id}, ${job.user_id}, ${others.length}, ${key}, ${mime}, ${size}, 'stored', ${attempts + 1})
      on conflict (id) do update set storage_key = excluded.storage_key, content_type = excluded.content_type,
        byte_size = excluded.byte_size, status = 'stored', upload_attempts = excluded.upload_attempts`;
    return c.json({ stored: true as const });
  })

  /** 생성 시작: draft → queued, 원본 응답 공간 예약, plan 메시지 */
  .post("/:jobId/start", async (c) => {
    const { sql, job } = await requireJob(c);
    if (job.status !== "draft") throw new ApiError("JOB_NOT_STARTABLE", 409);
    const [count] = await sql<
      { n: number }[]
    >`select count(*)::int as n from job_inputs where job_id = ${job.id} and status = 'stored'`;
    if (!count?.n) throw new ApiError("PRODUCT_IMAGE_REQUIRED", 412);
    const reserved = job.section_count * RAW_RESERVE_BYTES_PER_SECTION;
    await assertStorageQuota(sql, job.user_id, reserved);
    await sql`update jobs set status = 'queued', reserved_bytes = ${reserved} where id = ${job.id}`;
    try {
      await enqueue(c.get("ctx"), { kind: "plan", userId: job.user_id, jobId: job.id });
    } catch {
      await sql`update jobs set status = 'draft', reserved_bytes = 0 where id = ${job.id}`;
      throw new ApiError("QUEUE_UNAVAILABLE", 503);
    }
    return c.json({ queued: true as const });
  })

  .get("/:jobId", async (c) => {
    const { sql, job } = await requireJob(c);
    return c.json(
      toJob(job, await listSections(sql, job.id), c.get("ctx").config.IMAGE_GENERATION_ENABLED),
    );
  })

  .post("/:jobId/sections/:sectionIndex/retry", async (c) => {
    const { sql, job } = await requireJob(c);
    const index = sectionIndex(c);
    const section = await getSection(sql, job.id, index);
    if (!section) throw new ApiError("SECTION_NOT_FOUND", 404);
    if (section.status === "generating" || section.status === "queued")
      throw new ApiError("SECTION_NOT_RETRYABLE", 409);
    if (section.manual_retries >= SECTION_MANUAL_RETRY_MAX)
      throw new ApiError("SECTION_MANUAL_RETRY_LIMIT", 429);
    await sql`update job_sections set status = 'queued', error_code = null, error_detail = null, attempt = 0,
              manual_retries = ${section.manual_retries + 1} where job_id = ${job.id} and section_index = ${index}`;
    const enabled = c.get("ctx").config.IMAGE_GENERATION_ENABLED;
    if (enabled)
      await enqueue(c.get("ctx"), {
        kind: "image",
        userId: job.user_id,
        jobId: job.id,
        sectionIndex: index,
        attempt: 1,
        deferrals: 0,
      });
    return c.json({ queued: true as const, sectionIndex: index, imageGenerationEnabled: enabled });
  })

  .patch("/:jobId/sections/:sectionIndex/copy", async (c) => {
    const { sql, job } = await requireJob(c);
    const index = sectionIndex(c);
    const body = sectionCopyUpdateSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("INVALID_SECTION_COPY", 400);
    const [updated] = await sql<SectionRow[]>`
      update job_sections set headline = ${body.data.headline}, subheadline = ${body.data.subheadline},
             bullets = ${body.data.bullets}, copy_version = ${body.data.expectedCopyVersion + 1}
       where job_id = ${job.id} and section_index = ${index} and copy_version = ${body.data.expectedCopyVersion}
       returning *`;
    if (updated) return c.json({ updated: true as const, section: toSection(updated) });
    const current = await getSection(sql, job.id, index);
    if (!current) throw new ApiError("SECTION_NOT_FOUND", 404);
    throw new ApiError("COPY_VERSION_CONFLICT", 409, { currentCopyVersion: current.copy_version });
  })

  .patch("/:jobId/sections/:sectionIndex/feedback", async (c) => {
    const { sql, job } = await requireJob(c);
    const index = sectionIndex(c);
    const body = sectionFeedbackSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("INVALID_SECTION_COPY", 400);
    const [updated] = await sql<SectionRow[]>`
      update job_sections set feedback = ${body.data.feedback || null}
       where job_id = ${job.id} and section_index = ${index} returning *`;
    if (!updated) throw new ApiError("SECTION_NOT_FOUND", 404);
    return c.json({ updated: true as const, section: toSection(updated) });
  })

  /** 원본 응답 JSON. 브라우저가 디코드·합성한다. */
  .get("/:jobId/sections/:sectionIndex/raw", async (c) => {
    const { job } = await requireJob(c);
    const index = sectionIndex(c);
    const buf = await c.get("ctx").storage.get(storageKeys.raw(job.user_id, job.id, index));
    if (!buf) throw new ApiError("ARTIFACT_NOT_FOUND", 404);
    return new Response(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(buf.byteLength),
        "Cache-Control": "private, no-store",
      },
    });
  });
