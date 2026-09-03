import { z } from "zod";
import { LEGACY_SECTION_COUNT, SECTION_COUNT } from "../constants.js";
import { SECTION_ROLES } from "../story.js";
import { storyOrderSchema } from "./brief.js";
import { sectionIndexSchema, sectionSchema } from "./section.js";

export const jobStatusSchema = z.enum([
  "draft",
  "queued",
  "planning",
  "generating",
  "partial",
  "completed",
  "failed",
]);
export type JobStatus = z.infer<typeof jobStatusSchema>;

const orderedSections = (count: number) =>
  z
    .array(sectionSchema)
    .length(count)
    .superRefine((sections, ctx) => {
      sections.forEach((s, i) => {
        if (s.index !== i + 1) {
          ctx.addIssue({
            code: "custom",
            path: [i, "index"],
            message: "Sections must be ordered.",
          });
        }
        if (s.role !== SECTION_ROLES[i]) {
          ctx.addIssue({ code: "custom", path: [i, "role"], message: "Role slot mismatch." });
        }
      });
    });

/** GET /api/jobs/:id 응답 */
export const jobSchema = z.object({
  jobId: z.uuid(),
  productName: z.string().min(1).max(80),
  status: jobStatusSchema,
  storyOrder: storyOrderSchema,
  sections: z.union([
    z.array(z.never()).length(0),
    orderedSections(LEGACY_SECTION_COUNT),
    orderedSections(SECTION_COUNT),
  ]),
  imageGenerationEnabled: z.boolean(),
  /** 기획 단계 등 작업 전체가 실패했을 때의 코드 (섹션이 없을 수 있다) */
  errorCode: z.string().nullable().optional(),
});
export type Job = z.infer<typeof jobSchema>;

export const jobCreatedSchema = z.object({ id: z.uuid() });
export const inputStoredSchema = z.object({ stored: z.literal(true) });
export const jobStartedSchema = z.object({ queued: z.literal(true) });
export const sectionRetrySchema = z.object({
  queued: z.literal(true),
  sectionIndex: sectionIndexSchema,
  imageGenerationEnabled: z.boolean(),
});
export const sectionFeedbackUpdatedSchema = z.object({
  updated: z.literal(true),
  section: sectionSchema,
});
export const sectionCopyUpdatedSchema = z.object({
  updated: z.literal(true),
  section: sectionSchema,
});
export const copyVersionConflictSchema = z.object({
  error: z.literal("COPY_VERSION_CONFLICT"),
  currentCopyVersion: z.number().int().min(1),
});

/** Supabase Realtime(job_sections) 이벤트 행 */
export const sectionRealtimeRowSchema = z.object({
  job_id: z.uuid(),
  user_id: z.uuid(),
  section_index: sectionIndexSchema,
  status: sectionSchema.shape.status,
});
export type SectionRealtimeRow = z.infer<typeof sectionRealtimeRowSchema>;

/** 설정 API */
export const openaiKeyStoredSchema = z.object({
  stored: z.literal(true),
  lastFour: z.string().regex(/^[A-Za-z0-9_-]{4}$/),
});
export const imageParallelismSchema = z.union([z.literal(5), z.literal(10)]);
export const imageSpeedSchema = z.object({ imageParallelism: imageParallelismSchema });

/** 작업 상태를 섹션 상태에서 계산한다 (클라이언트 낙관 갱신과 서버 집계가 같은 규칙을 쓴다) */
export function deriveJobStatus(sections: ReadonlyArray<{ status: string }>): JobStatus {
  const total = sections.length;
  if (total === 0) return "planning";
  const completed = sections.filter((s) => s.status === "completed").length;
  const failed = sections.filter((s) => s.status === "failed").length;
  if (completed === total) return "completed";
  if (failed === total) return "failed";
  if (completed + failed === total) return "partial";
  return "generating";
}
