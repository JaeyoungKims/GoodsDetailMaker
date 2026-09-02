import type { SupabaseClient } from "@supabase/supabase-js";
import { IMAGE_DEFERRAL_MAX, STALE_GENERATING_MINUTES } from "@gdm/shared";

export type DispatchDecision =
  | { kind: "proceed" }
  | { kind: "defer"; delaySeconds: number; reason: "rate_limited" | "slots_full" }
  | { kind: "exhausted" };

export interface DispatchInput {
  /** 이번 메시지가 이미 미뤄진 횟수 */
  deferrals: number;
  /** user_settings.rate_limited_until (없으면 null) */
  rateLimitedUntil: Date | null;
  /** DB 슬롯 점유 결과. rate limit 검사 뒤에만 시도한다. */
  claimSlot: () => Promise<boolean>;
  now?: Date;
}

/**
 * 이미지 메시지를 지금 처리할지 결정한다.
 * 1) 사용자가 최근 429 를 받았으면 그 시각까지 기다린다 (자동 감속)
 * 2) 사용자 동시 생성 한도(5|10) 안에서 슬롯을 잡는다
 * 3) 너무 오래 미뤄지면 IMAGE_DISPATCH_EXHAUSTED 로 실패
 */
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
  // 슬롯이 꽉 찼을 때: 미뤄진 횟수에 따라 5→30초 사이로 점점 늘린다
  const delaySeconds = Math.min(5 + input.deferrals * 2, 30);
  return { kind: "defer", delaySeconds, reason: "slots_full" };
}

export async function claimImageSlot(
  db: SupabaseClient,
  args: { userId: string; jobId: string; sectionIndex: number; limit: number; attempt: number },
): Promise<boolean> {
  const { data, error } = await db.rpc("claim_image_slot", {
    p_user_id: args.userId,
    p_job_id: args.jobId,
    p_index: args.sectionIndex,
    p_limit: args.limit,
    p_attempt: args.attempt,
    p_stale_minutes: STALE_GENERATING_MINUTES,
  });
  if (error) throw new Error(`GATE_UNAVAILABLE: ${error.message}`);
  return data === true;
}

export async function readRateLimitedUntil(
  db: SupabaseClient,
  userId: string,
): Promise<Date | null> {
  const { data } = await db
    .from("user_settings")
    .select("rate_limited_until")
    .eq("user_id", userId)
    .maybeSingle<{ rate_limited_until: string | null }>();
  return data?.rate_limited_until ? new Date(data.rate_limited_until) : null;
}

/** 429 를 받으면 사용자 전체를 retry-after 만큼 감속한다 (설정한 동시 수는 유지) */
export async function markRateLimited(
  db: SupabaseClient,
  userId: string,
  seconds: number,
): Promise<void> {
  const until = new Date(Date.now() + Math.min(Math.max(seconds, 5), 300) * 1000).toISOString();
  await db
    .from("user_settings")
    .upsert({ user_id: userId, rate_limited_until: until }, { onConflict: "user_id" });
}
