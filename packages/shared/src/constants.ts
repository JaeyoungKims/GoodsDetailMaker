/** 이미지 규격: OpenAI gpt-image-2 세로형 */
export const IMAGE_WIDTH = 1024;
export const IMAGE_HEIGHT = 1536;
export const IMAGE_MODEL = "gpt-image-2";
export const IMAGE_QUALITY = "medium";

/** 한 작업이 만드는 이미지 장 수 */
export const SECTION_COUNT = 13;
/** 레거시 호환: 10장 작업도 읽을 수 있어야 한다 */
export const LEGACY_SECTION_COUNT = 10;

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

/** 재시도 정책 */
export const IMAGE_AUTO_ATTEMPT_MAX = 5;
export const SECTION_MANUAL_RETRY_MAX = 3;
export const IMAGE_PARALLELISM_OPTIONS = [5, 10] as const;
export const IMAGE_PARALLELISM_DEFAULT = 5;

/** 카피 길이 제한 */
export const HEADLINE_MAX = 28;
export const SUBHEADLINE_MAX = 52;
export const BULLET_MAX = 30;
export const BULLETS_MAX = 3;

/** 원본 응답(JSON) 크기 상한 */
export const RAW_RESPONSE_MAX_BYTES = 12_000_000;
