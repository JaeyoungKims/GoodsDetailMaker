import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SECTION_ROLES,
  type Job,
  type ProductBrief,
  type Section,
  type SectionPlan,
  deriveJobStatus,
  jobSchema,
} from "@gdm/shared";

/** DB 행 → API 응답 매핑. 컬럼명은 supabase/migrations 참고. */
export interface JobRow {
  id: string;
  user_id: string;
  status: string;
  product_name: string;
  brief: ProductBrief;
  story_order: string[];
  image_generation_enabled: boolean;
  expires_at: string;
}

export interface SectionRow {
  job_id: string;
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
  copy_version: number;
  attempt: number;
  manual_retries: number;
  raw_r2_key: string | null;
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
    copyVersion: row.copy_version,
  };
}

export function toJob(row: JobRow, sections: SectionRow[], generationEnabled: boolean): Job {
  const ordered = [...sections].sort((a, b) => a.section_index - b.section_index).map(toSection);
  return jobSchema.parse({
    jobId: row.id,
    productName: row.product_name || "이름 없는 상품",
    status: row.status,
    storyOrder: row.story_order,
    sections: ordered,
    imageGenerationEnabled: generationEnabled && row.image_generation_enabled,
  });
}

export async function findJob(db: SupabaseClient, userId: string, jobId: string) {
  const { data, error } = await db
    .from("jobs")
    .select("*")
    .eq("id", jobId)
    .eq("user_id", userId)
    .maybeSingle<JobRow>();
  if (error) throw new Error(error.message);
  return data;
}

export async function listSections(db: SupabaseClient, jobId: string) {
  const { data, error } = await db
    .from("job_sections")
    .select("*")
    .eq("job_id", jobId)
    .order("section_index")
    .returns<SectionRow[]>();
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function updateJobStatus(db: SupabaseClient, jobId: string, status: string) {
  const { error } = await db.from("jobs").update({ status }).eq("id", jobId);
  if (error) throw new Error(error.message);
}

/** 섹션 상태가 바뀔 때마다 작업 상태를 재집계한다 */
export async function recomputeJobStatus(db: SupabaseClient, jobId: string) {
  const sections = await listSections(db, jobId);
  await updateJobStatus(db, jobId, deriveJobStatus(sections));
}

/** 기획 결과 13개를 job_sections 에 넣는다 (planning → generating 전환 시) */
export async function insertPlannedSections(
  db: SupabaseClient,
  userId: string,
  jobId: string,
  plans: SectionPlan[],
) {
  const rows = plans.map((p) => ({
    job_id: jobId,
    user_id: userId,
    section_index: p.index,
    role: p.role ?? SECTION_ROLES[p.index - 1],
    headline: p.headline,
    subheadline: p.subheadline,
    bullets: p.bullets,
    visual_direction: p.visualDirection,
    image_prompt: p.imagePrompt,
    copy_placement: p.copyPlacement,
    render_mode: p.renderMode,
    status: "queued",
  }));
  const { error } = await db
    .from("job_sections")
    .upsert(rows, { onConflict: "job_id,section_index" });
  if (error) throw new Error(error.message);
}
