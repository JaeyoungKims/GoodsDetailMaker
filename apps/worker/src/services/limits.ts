import type { SupabaseClient } from "@supabase/supabase-js";
import {
  JOB_ACTIVE_LIMIT,
  JOB_DAILY_LIMIT,
  SERVICE_STORAGE_QUOTA_BYTES,
  USER_STORAGE_QUOTA_BYTES,
} from "@gdm/shared";
import { ApiError } from "../lib/errors.js";

const ACTIVE_STATUSES = ["draft", "queued", "planning", "generating"] as const;

/** 진행 중 작업 수와 최근 24시간 생성 수를 검사한다 (POST /api/jobs) */
export async function assertJobLimits(db: SupabaseClient, userId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [active, daily] = await Promise.all([
    db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", [...ACTIVE_STATUSES]),
    db
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since),
  ]);
  if (active.error || daily.error) throw new ApiError("INTERNAL_ERROR", 500);
  if ((active.count ?? 0) >= JOB_ACTIVE_LIMIT) throw new ApiError("JOB_ACTIVE_LIMIT", 429);
  if ((daily.count ?? 0) >= JOB_DAILY_LIMIT) throw new ApiError("JOB_DAILY_LIMIT", 429);
}

export interface StorageUsage {
  userBytes: number;
  serviceBytes: number;
}

export async function getStorageUsage(db: SupabaseClient, userId: string): Promise<StorageUsage> {
  const { data, error } = await db.rpc("storage_usage", { p_user_id: userId }).single<{
    user_bytes: number | string;
    service_bytes: number | string;
  }>();
  if (error || !data) throw new ApiError("INTERNAL_ERROR", 500);
  return { userBytes: Number(data.user_bytes), serviceBytes: Number(data.service_bytes) };
}

/** 추가로 쓰려는 바이트를 더했을 때 사용자·서비스 한도를 넘는지 검사한다 */
export function exceedsQuota(usage: StorageUsage, additionalBytes: number): boolean {
  return (
    usage.userBytes + additionalBytes > USER_STORAGE_QUOTA_BYTES ||
    usage.serviceBytes + additionalBytes > SERVICE_STORAGE_QUOTA_BYTES
  );
}

export async function assertStorageQuota(
  db: SupabaseClient,
  userId: string,
  additionalBytes: number,
) {
  if (exceedsQuota(await getStorageUsage(db, userId), additionalBytes)) {
    throw new ApiError("STORAGE_QUOTA_LIMIT", 507);
  }
}
