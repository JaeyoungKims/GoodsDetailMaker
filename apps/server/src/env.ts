import { z } from "zod";

/** .env 에 항목만 있고 값이 비어 있으면 미설정으로 본다 (빈 문자열로 서버가 죽지 않도록) */
const optionalText = z.preprocess((v) => (v === "" ? undefined : v), z.string().min(1).optional());

/** 서버 설정. 환경변수(.env)에서 읽는다. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8787),
  /** postgres://user:pass@host:5432/dbname */
  DATABASE_URL: z.string().min(1),
  /** 업로드 사진·원본 응답 저장 폴더 (절대경로 권장) */
  DATA_DIR: z.string().min(1).default("./data"),
  /** OpenAI 키 암호화용 32바이트 이상 비밀. `openssl rand -base64 48` */
  APP_SECRET: z.string().min(32),
  /** 웹 정적 파일 폴더 (빌드 결과). 비우면 API 만 제공 */
  WEB_DIST: z.string().default("../web/dist"),
  /** 결과물 보관 일수. 0 = 무제한 */
  JOB_RETENTION_DAYS: z.coerce.number().int().min(0).default(0),
  IMAGE_GENERATION_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  PLAN_MODEL: z.string().default("gpt-5-mini"),
  IMAGE_MODEL: z.string().default("gpt-image-2"),
  /** 소셜 로그인 리다이렉트의 기준 주소. 도메인이 생기면 이 값만 바꾼다 */
  PUBLIC_BASE_URL: z.string().url().default("http://localhost:8787"),
  /** 소셜 로그인 클라이언트. 채워진 제공자만 로그인 화면에 노출된다 */
  GOOGLE_CLIENT_ID: optionalText,
  GOOGLE_CLIENT_SECRET: optionalText,
  KAKAO_CLIENT_ID: optionalText,
  KAKAO_CLIENT_SECRET: optionalText,
  NAVER_CLIENT_ID: optionalText,
  NAVER_CLIENT_SECRET: optionalText,
  /** 회원가입 허용 여부. false 면 기존 계정만 로그인 가능 */
  ALLOW_SIGNUP: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  /** 이메일 인증 없이 가입 즉시 사용 (1인·소규모용) */
  SESSION_DAYS: z.coerce.number().int().min(1).default(30),
});

export type AppConfig = z.infer<typeof schema>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  ");
    throw new Error(`설정이 올바르지 않습니다:\n  ${issues}\n.env.example 을 참고하세요.`);
  }
  return parsed.data;
}
