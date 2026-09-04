import { z } from "zod";
import { OPTION_MAX } from "../constants.js";
import { COPY_STYLES, COPY_STYLE_DEFAULT } from "../copyStyle.js";
import { DEFAULT_STORY_ORDER, STORY_STAGES } from "../story.js";
import { LEGACY_TONES, TONES } from "../tone.js";

const line = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");

/**
 * storyOrder: 13단계 중 원하는 것만 0~13개, 중복 없이. 순서가 곧 장 순서다.
 * 비우면 본문 없이 마켓 썸네일만 만든다.
 */
export const storyOrderSchema = z
  .array(z.enum(STORY_STAGES))
  .max(STORY_STAGES.length)
  .superRefine((order, ctx) => {
    if (new Set(order).size !== order.length) {
      ctx.addIssue({
        code: "custom",
        message: "Story order must not repeat a persuasion stage.",
      });
    }
  });

/** 상품 옵션 하나. 사진은 선택이며, 없으면 주력 제품 사진으로 썸네일을 만든다. */
export const productOptionSchema = z.object({
  name: line(40),
  inputId: z.uuid().optional(),
});
export type ProductOption = z.infer<typeof productOptionSchema>;

export const toneSchema = z.enum([...TONES, ...LEGACY_TONES]);

/** POST /api/jobs 요청 본문 */
export const productBriefSchema = z.object({
  productName: optionalText(80),
  category: optionalText(80),
  targetCustomer: optionalText(240),
  coreBenefits: z.array(line(120)).max(5).default([]),
  evidence: z.array(line(200)).max(8).default([]),
  tone: toneSchema,
  prohibitedClaims: z.array(line(120)).max(10).default([]),
  additionalNotes: z.string().trim().max(1000).default(""),
  storyOrder: storyOrderSchema.default([...DEFAULT_STORY_ORDER]),
  /** 문구를 이미지에 얹는 방식. 작업 전체에 같은 것을 쓴다. */
  copyStyle: z.enum(COPY_STYLES).default(COPY_STYLE_DEFAULT),
  /** 비어 있으면 썸네일을 만들지 않는다 */
  options: z.array(productOptionSchema).max(OPTION_MAX).default([]),
});
export type ProductBrief = z.infer<typeof productBriefSchema>;
export type ProductBriefInput = z.input<typeof productBriefSchema>;
