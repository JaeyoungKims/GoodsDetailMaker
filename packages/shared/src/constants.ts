/** 이미지 규격: OpenAI gpt-image-2 세로형 */
export const IMAGE_WIDTH = 1024;
export const IMAGE_HEIGHT = 1536;
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_QUALITY = "medium";

/** 한 작업이 만들 수 있는 최대 장 수. 실제 장 수는 사용자가 고른 설득 단계 수(job.section_count)다. */
export const SECTION_COUNT = 13;

/** 입력 이미지 한도 */
export const INPUT_IMAGE_MIN = 1;
export const INPUT_IMAGE_MAX = 5;
export const INPUT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const INPUT_IMAGE_TOTAL_MAX_BYTES = 25 * 1024 * 1024;
export const INPUT_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
/** 브라우저 정규화 후 최대 변 길이(px) */
export const INPUT_IMAGE_MAX_EDGE = 2048;

/** 저장 공간·보관 정책 */
export const USER_STORAGE_QUOTA_BYTES = 250 * 1024 * 1024;
export const SERVICE_STORAGE_QUOTA_BYTES = 8 * 1024 * 1024 * 1024;
export const JOB_RETENTION_HOURS = 24;

/** 작업 수 한도 */
export const JOB_ACTIVE_LIMIT = 3;
export const JOB_DAILY_LIMIT = 10;
export const UPLOAD_ATTEMPT_MAX = 10;
/** 생성 시작 시 미리 예약하는 원본 응답 공간 (장당) */
export const RAW_RESERVE_BYTES_PER_SECTION = 3 * 1024 * 1024;

/** 재시도 정책 */
export const IMAGE_AUTO_ATTEMPT_MAX = 5;
export const SECTION_MANUAL_RETRY_MAX = 3;
export const IMAGE_PARALLELISM_OPTIONS = [5, 10] as const;
export const IMAGE_PARALLELISM_DEFAULT = 5;
/** 동시 생성 게이트 때문에 미뤄질 수 있는 최대 횟수 (attempt 와 별개) */
export const IMAGE_DEFERRAL_MAX = 60;
/** 이 시간 넘게 generating 이면 죽은 워커로 보고 실패 처리 */
export const STALE_GENERATING_MINUTES = 10;

/** 로그인·계정 */
export const PASSWORD_MIN_LENGTH = 8;
/** 소셜 로그인 제공자. 서버에 client id/secret 이 채워진 것만 실제로 노출된다. */
export const OAUTH_PROVIDERS = ["google", "kakao", "naver"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];
export const OAUTH_PROVIDER_LABELS: Record<OAuthProvider, string> = {
  google: "구글",
  kakao: "카카오",
  naver: "네이버",
};
/** 관리자가 발급한 비밀번호 재설정 링크의 유효 시간 */
export const PASSWORD_RESET_HOURS = 24;

/** 카피 길이 제한 */
export const HEADLINE_MAX = 28;
export const SUBHEADLINE_MAX = 52;
export const BULLET_MAX = 30;
export const BULLETS_MAX = 3;

/** 원본 응답(JSON) 크기 상한 */
export const RAW_RESPONSE_MAX_BYTES = 12_000_000;
