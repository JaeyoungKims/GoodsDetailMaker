import {
  deriveJobStatus,
  jobSchema,
  type Job,
  type ProductBrief,
  type Section,
  type SectionPlan,
} from "@gdm/shared";
import type { Sql } from "../db/client.js";
import { listThumbnails, toThumbnail, type ThumbnailRow } from "./thumbnails.js";

export interface JobRow {
  id: string;
  user_id: string;
  status: string;
  product_name: string;
  brief: ProductBrief;
  story_order: string[];
  section_count: number;
  image_generation_enabled: boolean;
  reserved_bytes: number;
  expires_at: Date | null;
  error_code: string | null;
  error_detail: string | null;
}

export interface SectionRow {
  job_id: string;
  user_id: string;
  section_index: number;
  role: string;
  headline: string;
  subheadline: string;
  bullets: string[];
  visual_direction: string;
  image_prompt: string;
  copy_placement: string;
  render_mode: string;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  feedback: string | null;
  feedback_history: Array<{ note: string; appliedAt: string }>;
  copy_version: number;
  attempt: number;
  manual_retries: number;
  raw_storage_key: string | null;
  raw_bytes: number;
}

export function toSection(row: SectionRow): Section {
  return {
    index: row.section_index,
    role: row.role as Section["role"],
    headline: row.headline,
    subheadline: row.subheadline,
    bullets: row.bullets,
    visualDirection: row.visual_direction,
    imagePrompt: row.image_prompt,
    copyPlacement: row.copy_placement as Section["copyPlacement"],
    renderMode: row.render_mode as Section["renderMode"],
    status: row.status as Section["status"],
    errorCode: row.error_code as Section["errorCode"],
    errorDetail: row.error_detail,
    feedback: row.feedback,
    feedbackHistory: row.feedback_history ?? [],
    copyVersion: row.copy_version,
  };
}

export function toJob(
  row: JobRow,
  sections: SectionRow[],
  generationEnabled: boolean,
  thumbnails: ThumbnailRow[] = [],
): Job {
  const ordered = [...sections].sort((a, b) => a.section_index - b.section_index).map(toSection);
  return jobSchema.parse({
    jobId: row.id,
    productName: row.product_name || "이름 없는 상품",
    status: row.status,
    storyOrder: row.story_order,
    sections: ordered,
    imageGenerationEnabled: generationEnabled && row.image_generation_enabled,
    errorCode: row.error_code ?? null,
    errorDetail: row.error_detail ?? null,
    copyStyle: row.brief?.copyStyle,
    thumbnails: thumbnails.map(toThumbnail),
  });
}

export async function findJob(sql: Sql, userId: string, jobId: string): Promise<JobRow | null> {
  const [row] = await sql<JobRow[]>`select * from jobs where id = ${jobId} and user_id = ${userId}`;
  return row ?? null;
}

export async function listSections(sql: Sql, jobId: string): Promise<SectionRow[]> {
  return sql<
    SectionRow[]
  >`select * from job_sections where job_id = ${jobId} order by section_index`;
}

export async function getSection(
  sql: Sql,
  jobId: string,
  index: number,
): Promise<SectionRow | null> {
  const [row] = await sql<
    SectionRow[]
  >`select * from job_sections where job_id = ${jobId} and section_index = ${index}`;
  return row ?? null;
}

export async function updateJobStatus(
  sql: Sql,
  jobId: string,
  status: string,
  errorCode: string | null = null,
  errorDetail: string | null = null,
) {
  await sql`update jobs set status = ${status}, error_code = ${errorCode},
              error_detail = ${errorDetail} where id = ${jobId}`;
}

/**
 * 작업 상태는 본문과 썸네일을 합쳐서 계산한다.
 * 썸네일만 만드는 작업은 본문이 0장이라, 본문만 보면 영원히 planning 에 머문다.
 */
export async function recomputeJobStatus(sql: Sql, jobId: string) {
  const [sections, thumbnails] = await Promise.all([
    listSections(sql, jobId),
    listThumbnails(sql, jobId),
  ]);
  await updateJobStatus(sql, jobId, deriveJobStatus([...sections, ...thumbnails]));
}

export async function insertPlannedSections(
  sql: Sql,
  userId: string,
  jobId: string,
  plans: SectionPlan[],
) {
  const rows = plans.map((p) => ({
    job_id: jobId,
    user_id: userId,
    section_index: p.index,
    role: p.role,
    headline: p.headline,
    subheadline: p.subheadline,
    bullets: p.bullets,
    visual_direction: p.visualDirection,
    image_prompt: p.imagePrompt,
    copy_placement: p.copyPlacement,
    render_mode: p.renderMode,
    status: "queued",
  }));
  await sql`
    insert into job_sections ${sql(rows)}
    on conflict (job_id, section_index) do update set
      role = excluded.role, headline = excluded.headline, subheadline = excluded.subheadline,
      bullets = excluded.bullets, visual_direction = excluded.visual_direction,
      image_prompt = excluded.image_prompt, copy_placement = excluded.copy_placement,
      render_mode = excluded.render_mode, status = 'queued', error_code = null, error_detail = null`;
}

/** 섹션 한 행을 부분 갱신한다 (컬럼 목록은 화이트리스트) */
const SECTION_COLUMNS = new Set([
  "status",
  "error_code",
  "error_detail",
  "attempt",
  "manual_retries",
  "copy_version",
  "headline",
  "subheadline",
  "bullets",
  "image_prompt",
  "feedback",
  "feedback_history",
  "raw_storage_key",
  "raw_bytes",
]);
export async function updateSection(
  sql: Sql,
  jobId: string,
  index: number,
  patch: Record<string, unknown>,
) {
  const cols = Object.keys(patch).filter((k) => SECTION_COLUMNS.has(k));
  if (cols.length === 0) return;
  await sql`update job_sections set ${sql(patch as Record<string, never>, ...(cols as never[]))}
            where job_id = ${jobId} and section_index = ${index}`;
}
