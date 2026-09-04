import { z } from "zod";
import {
  BULLETS_MAX,
  BULLET_MAX,
  HEADLINE_MAX,
  SECTION_COUNT,
  SUBHEADLINE_MAX,
} from "../constants.js";
import { SECTION_ERROR_CODES } from "../errors.js";
import { SECTION_ROLES, STAGE_TO_ROLE, type StoryStage } from "../story.js";

export const renderModeSchema = z.enum(["browser_overlay", "image_model_text"]);
export type RenderMode = z.infer<typeof renderModeSchema>;

export const copyPlacementSchema = z.enum(["top", "center", "bottom"]);
export type CopyPlacement = z.infer<typeof copyPlacementSchema>;

export const sectionStatusSchema = z.enum([
  "queued",
  "waiting_rate_limit",
  "generating",
  "completed",
  "failed",
]);
export type SectionStatus = z.infer<typeof sectionStatusSchema>;

export const sectionIndexSchema = z.number().int().min(1).max(SECTION_COUNT);

/** 기획 모델이 만드는 섹션 설계 (이미지 생성 전) */
export const sectionPlanSchema = z.object({
  index: sectionIndexSchema,
  role: z.enum(SECTION_ROLES),
  headline: z.string().trim().min(1).max(HEADLINE_MAX),
  subheadline: z.string().trim().max(SUBHEADLINE_MAX),
  bullets: z.array(z.string().trim().min(1).max(BULLET_MAX)).max(BULLETS_MAX),
  visualDirection: z.string().trim().min(1).max(500),
  imagePrompt: z.string().trim().min(20).max(4000),
  copyPlacement: copyPlacementSchema,
  renderMode: renderModeSchema.default("browser_overlay"),
});
export type SectionPlan = z.infer<typeof sectionPlanSchema>;

/**
 * 기획 결과 전체: storyOrder 길이만큼, index 는 1부터 순서대로.
 * role 은 그 자리의 설득 단계가 정한다(STAGE_TO_ROLE). image_model_text 는 동일 visualDirection.
 */
export const sectionPlanListSchema = (storyOrder: readonly StoryStage[]) =>
  z
    .object({ sections: z.array(sectionPlanSchema).length(storyOrder.length) })
    .superRefine(({ sections }, ctx) => {
      const sharedDirection = sections.find(
        (s) => s.renderMode === "image_model_text",
      )?.visualDirection;
      sections.forEach((section, i) => {
        const expectedIndex = i + 1;
        const expectedRole = STAGE_TO_ROLE[storyOrder[i]!];
        if (section.index !== expectedIndex) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", i, "index"],
            message: `Section ${expectedIndex} must have index ${expectedIndex}.`,
          });
        }
        if (section.role !== expectedRole) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", i, "role"],
            message: `Section ${expectedIndex} must use the ${expectedRole} role.`,
          });
        }
        if (
          section.renderMode === "image_model_text" &&
          sharedDirection !== undefined &&
          section.visualDirection !== sharedDirection
        ) {
          ctx.addIssue({
            code: "custom",
            path: ["sections", i, "visualDirection"],
            message: "All image-model sections must share one identical visualDirection.",
          });
        }
      });
    });

/** 사용자가 편집하는 카피 */
const copyText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((v) => v.trim().length > 0, "Copy must contain a non-whitespace character.");
const optionalCopyText = (max: number) =>
  z
    .string()
    .max(max)
    .refine(
      (v) => v.length === 0 || v.trim().length > 0,
      "Copy must be empty or contain a non-whitespace character.",
    );

export const sectionCopySchema = z.object({
  headline: copyText(HEADLINE_MAX),
  subheadline: optionalCopyText(SUBHEADLINE_MAX),
  bullets: z.array(copyText(BULLET_MAX)).max(BULLETS_MAX),
});
export type SectionCopy = z.infer<typeof sectionCopySchema>;

/** PATCH /api/jobs/:id/sections/:n/copy 요청 본문 (낙관적 잠금) */
/** 장별 "고칠 점" 메모. 다음 재생성 때 이미지 프롬프트에 반영된다. */
export const FEEDBACK_MAX = 500;
export const sectionFeedbackSchema = z.object({
  feedback: z.string().trim().max(FEEDBACK_MAX),
});
export type SectionFeedback = z.infer<typeof sectionFeedbackSchema>;

export const feedbackHistoryEntrySchema = z.object({
  note: z.string(),
  appliedAt: z.string(),
});
export type FeedbackHistoryEntry = z.infer<typeof feedbackHistoryEntrySchema>;

export const sectionCopyUpdateSchema = sectionCopySchema.extend({
  expectedCopyVersion: z.number().int().min(1).max(2147483647),
});
export type SectionCopyUpdate = z.infer<typeof sectionCopyUpdateSchema>;

/** API 가 돌려주는 섹션 상태 */
export const sectionSchema = sectionPlanSchema.extend({
  status: sectionStatusSchema,
  errorCode: z.enum(SECTION_ERROR_CODES).nullable(),
  /** 실패 사유 원문 (OpenAI 오류 메시지 등). 운영자·사용자가 원인을 볼 수 있게 한다. */
  errorDetail: z.string().max(500).nullable().optional(),
  /** 아직 반영되지 않은 고칠 점 메모 */
  feedback: z.string().nullable().optional(),
  /** 재생성에 반영된 메모 이력 (오래된 것부터) */
  feedbackHistory: z.array(feedbackHistoryEntrySchema).optional(),
  copyVersion: z.number().int().min(1),
});
export type Section = z.infer<typeof sectionSchema>;
