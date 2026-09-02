import { z } from "zod";
import { IMAGE_AUTO_ATTEMPT_MAX, IMAGE_DEFERRAL_MAX } from "../constants.js";
import { sectionIndexSchema } from "./section.js";

/** Cloudflare Queues 메시지 */
export const queueMessageSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("plan"), userId: z.uuid(), jobId: z.uuid() }),
  z.object({
    kind: z.literal("image"),
    userId: z.uuid(),
    jobId: z.uuid(),
    sectionIndex: sectionIndexSchema,
    attempt: z.number().int().min(1).max(IMAGE_AUTO_ATTEMPT_MAX),
    /** 동시 생성 게이트·감속으로 미뤄진 횟수. OpenAI 호출 실패(attempt)와 구분한다. */
    deferrals: z.number().int().min(0).max(IMAGE_DEFERRAL_MAX).default(0),
  }),
]);
export type QueueMessage = z.infer<typeof queueMessageSchema>;
export type PlanMessage = Extract<QueueMessage, { kind: "plan" }>;
export type ImageMessage = Extract<QueueMessage, { kind: "image" }>;
