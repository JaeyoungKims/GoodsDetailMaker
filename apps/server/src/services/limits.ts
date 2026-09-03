import {
  JOB_ACTIVE_LIMIT,
  JOB_DAILY_LIMIT,
  SERVICE_STORAGE_QUOTA_BYTES,
  USER_STORAGE_QUOTA_BYTES,
} from "@gdm/shared";
import type { Sql } from "../db/client.js";
import { ApiError } from "../lib/errors.js";

/** 진행 중(대기·기획·생성) 작업 수와 24시간 내 시작 수. 초안은 세지 않는다. */
export async function assertJobLimits(sql: Sql, userId: string) {
  const [row] = await sql<{ active: number; daily: number }[]>`
    select
      count(*) filter (where status in ('queued','planning','generating'))::int as active,
      count(*) filter (where status <> 'draft' and created_at > now() - interval '24 hours')::int as daily
    from jobs where user_id = ${userId}`;
  if ((row?.active ?? 0) >= JOB_ACTIVE_LIMIT) throw new ApiError("JOB_ACTIVE_LIMIT", 429);
  if ((row?.daily ?? 0) >= JOB_DAILY_LIMIT) throw new ApiError("JOB_DAILY_LIMIT", 429);
}

export interface StorageUsage {
  userBytes: number;
  serviceBytes: number;
}

export async function getStorageUsage(sql: Sql, userId: string): Promise<StorageUsage> {
  const [row] = await sql<
    { user_bytes: number; service_bytes: number }[]
  >`select * from storage_usage(${userId})`;
  return { userBytes: Number(row?.user_bytes ?? 0), serviceBytes: Number(row?.service_bytes ?? 0) };
}

export function exceedsQuota(usage: StorageUsage, additionalBytes: number): boolean {
  return (
    usage.userBytes + additionalBytes > USER_STORAGE_QUOTA_BYTES ||
    usage.serviceBytes + additionalBytes > SERVICE_STORAGE_QUOTA_BYTES
  );
}

/**
 * 자체 호스팅에서는 디스크가 곧 한도다. 기본 상수(250MB/8GB)는 참고 사이트 정책이라
 * 여기서는 서비스 합계 한도만 크게 잡고(1TB) 사용자 한도는 두지 않는다. 필요하면 상수를 조정.
 */
export async function assertStorageQuota(sql: Sql, userId: string, additionalBytes: number) {
  const usage = await getStorageUsage(sql, userId);
  if (usage.serviceBytes + additionalBytes > 1024 * 1024 * 1024 * 1024)
    throw new ApiError("STORAGE_QUOTA_LIMIT", 507);
  void exceedsQuota;
}
