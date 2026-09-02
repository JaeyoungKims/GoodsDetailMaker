import { z } from "zod";
import { DEFAULT_STORY_ORDER, STORY_STAGES } from "../story.js";
import { LEGACY_TONES, TONES } from "../tone.js";

const line = (max: number) => z.string().trim().min(1).max(max);
const optionalText = (max: number) => z.string().trim().max(max).default("");

/** storyOrder: 13단계가 정확히 한 번씩, 순서만 다르게 */
export const storyOrderSchema = z
  .array(z.enum(STORY_STAGES))
  .length(STORY_STAGES.length)
  .superRefine((order, ctx) => {
    if (new Set(order).size !== STORY_STAGES.length) {
      ctx.addIssue({
        code: "custom",
        message: "Story order must contain every persuasion stage exactly once.",
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
