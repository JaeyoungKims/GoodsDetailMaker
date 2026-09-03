import { IMAGE_DEFERRAL_MAX, STALE_GENERATING_MINUTES } from "@gdm/shared";
import type { Sql } from "../db/client.js";

export type DispatchDecision =
  | { kind: "proceed" }
  | { kind: "defer"; delaySeconds: number; reason: "rate_limited" | "slots_full" }
  | { kind: "exhausted" };

export interface DispatchInput {
  deferrals: number;
  rateLimitedUntil: Date | null;
  claimSlot: () => Promise<boolean>;
  now?: Date;
}

/** 감속 중이면 기다리고, 동시 생성 슬롯이 있으면 잡고, 너무 오래 미뤄지면 소진 처리 */
export async function decideDispatch(input: DispatchInput): Promise<DispatchDecision> {
  const now = input.now ?? new Date();
  if (input.deferrals >= IMAGE_DEFERRAL_MAX) return { kind: "exhausted" };
  if (input.rateLimitedUntil && input.rateLimitedUntil.getTime() > now.getTime()) {
    const wait = Math.ceil((input.rateLimitedUntil.getTime() - now.getTime()) / 1000);
    return {
      kind: "defer",
      delaySeconds: Math.min(Math.max(wait, 5), 300),
      reason: "rate_limited",
    };
  }
  if (await input.claimSlot()) return { kind: "proceed" };
  return {
    kind: "defer",
    delaySeconds: Math.min(5 + input.deferrals * 2, 30),
    reason: "slots_full",
  };
}

export async function claimImageSlot(
  sql: Sql,
  args: { userId: string; jobId: string; sectionIndex: number; limit: number; attempt: number },
): Promise<boolean> {
  const [row] = await sql<{ claim_image_slot: boolean }[]>`
    select claim_image_slot(${args.userId}, ${args.jobId}, ${args.sectionIndex}, ${args.limit}, ${args.attempt}, ${STALE_GENERATING_MINUTES})`;
  return row?.claim_image_slot === true;
}
