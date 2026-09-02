import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AppEnv } from "../env.js";

/**
 * 서비스 롤 클라이언트. RLS 를 우회하므로 반드시 user_id 조건을 직접 건다.
 * Workers 는 요청마다 격리되므로 요청 단위로 생성해도 비용이 크지 않다.
 */
export function createServiceClient(env: AppEnv): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
