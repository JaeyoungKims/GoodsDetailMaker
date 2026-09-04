import { z } from "zod";
import { DEFAULT_STORY_ORDER, STORY_STAGES } from "../story.js";
import { LEGACY_TONES, TONES } from "../tone.js";

const line = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");

/** storyOrder: 13단계 중 원하는 것만 1~13개, 중복 없이. 순서가 곧 장 순서다. */
export const storyOrderSchema = z
  .array(z.enum(STORY_STAGES))
  .min(1)
  .max(STORY_STAGES.length)
  .superRefine((order, ctx) => {
    if (new Set(order).size !== order.length) {
      ctx.addIssue({
        code: "custom",
        message: "Story order must not repeat a persuasion stage.",
      });
    }
  });

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
});
export type ProductBrief = z.infer<typeof productBriefSchema>;
export type ProductBriefInput = z.input<typeof productBriefSchema>;
