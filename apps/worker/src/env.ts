/**
 * Worker 바인딩. `wrangler types` 가 만드는 worker-configuration.d.ts 의 Env 를
 * 코드에서 명시적으로 참조하기 위한 별칭이다.
 */
export interface AppEnv {
  ASSETS: Fetcher;
  ARTIFACTS: R2Bucket;
  JOB_QUEUE: Queue;
  APP_ENV: string;
  IMAGE_GENERATION_ENABLED: string;
  SUPABASE_URL: string;
  /** 기획 텍스트 모델 (선택). 비우면 services/openai.ts 의 기본값 */
  PLAN_MODEL?: string;
  /** 이미지 모델 (선택). 비우면 shared 의 IMAGE_MODEL(gpt-image-2) */
  IMAGE_MODEL?: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_JWT_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
}

export interface AuthUser {
  id: string;
  email: string | null;
}

/** Hono 컨텍스트 변수 */
export interface AppVariables {
  user: AuthUser;
  accessToken: string;
}

export type HonoEnv = { Bindings: AppEnv; Variables: AppVariables };

export function imageGenerationEnabled(env: AppEnv): boolean {
  return env.IMAGE_GENERATION_ENABLED !== "false";
}
