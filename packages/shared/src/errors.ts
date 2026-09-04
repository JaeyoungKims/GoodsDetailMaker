/** API 가 반환하는 요청 단위 에러 코드 */
export const API_ERROR_CODES = [
  "UNAUTHENTICATED",
  "INVALID_CREDENTIALS",
  "EMAIL_TAKEN",
  "SIGNUP_DISABLED",
  "FORBIDDEN",
  "USER_NOT_FOUND",
  "OAUTH_PROVIDER_DISABLED",
  "OAUTH_STATE_INVALID",
  "OAUTH_EXCHANGE_FAILED",
  "OAUTH_EMAIL_REQUIRED",
  "OAUTH_LINK_REQUIRES_LOGIN",
  "OAUTH_ALREADY_LINKED",
  "IDENTITY_NOT_FOUND",
  "LAST_LOGIN_METHOD",
  "RESET_TOKEN_INVALID",
  "INVALID_PRODUCT_BRIEF",
  "JOB_ACTIVE_LIMIT",
  "JOB_DAILY_LIMIT",
  "JOB_CREATE_CONFLICT",
  "API_KEY_REQUIRED",
  "PRODUCT_IMAGE_REQUIRED",
  "JOB_NOT_STARTABLE",
  "JOB_NOT_UPLOADABLE",
  "JOB_INPUT_LIMIT",
  "JOB_INPUT_BYTES_LIMIT",
  "STORAGE_QUOTA_LIMIT",
  "JOB_INPUT_CONFLICT",
  "JOB_UPLOAD_IN_PROGRESS",
  "JOB_UPLOAD_ATTEMPT_LIMIT",
  "INVALID_IMAGE",
  "QUEUE_UNAVAILABLE",
  "ARTIFACT_NOT_FOUND",
  "JOB_NOT_FOUND",
  "JOB_EXPIRED",
  "SECTION_NOT_FOUND",
  "SECTION_NOT_RETRYABLE",
  "SECTION_MANUAL_RETRY_LIMIT",
  "INVALID_SECTION_COPY",
  "COPY_VERSION_CONFLICT",
  "INVALID_IMAGE_PARALLELISM",
  "INVALID_API_KEY",
  "NOT_IMPLEMENTED",
  "INTERNAL_ERROR",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

/** 섹션(이미지 한 장) 처리 실패 코드. job_sections.error_code 에 저장된다. */
export const SECTION_ERROR_CODES = [
  "API_KEY_REQUIRED",
  "OPENAI_API_KEY_INVALID",
  "IMAGE_REQUEST_REJECTED",
  "INPUT_METADATA_INVALID",
  "INPUT_AGGREGATE_TOO_LARGE",
  "INPUT_OBJECT_MISSING",
  "INPUT_OBJECT_INVALID",
  "IMAGE_CONFIG_INVALID",
  "OPENAI_RATE_LIMIT",
  "OPENAI_PROVIDER_FAILED",
  "IMAGE_TIMEOUT",
  "IMAGE_NETWORK_FAILED",
  "IMAGE_RESPONSE_INVALID",
  "IMAGE_RESPONSE_TOO_LARGE",
  "IMAGE_RESPONSE_TIMEOUT",
  "STORAGE_FAILED",
  "VAULT_UNAVAILABLE",
  "IMAGE_WORKER_FAILED",
  "IMAGE_ATTEMPT_LIMIT",
  "IMAGE_CONSUMER_RETRY_EXHAUSTED",
  "IMAGE_DISPATCH_EXHAUSTED",
] as const;
export type SectionErrorCode = (typeof SECTION_ERROR_CODES)[number];

/** 사용자에게 보여줄 섹션 실패 안내 문구 */
export function sectionErrorMessage(code: SectionErrorCode | null | undefined): string {
  if (!code) return "다시 시도할 수 있어요.";
  if (code === "API_KEY_REQUIRED" || code === "OPENAI_API_KEY_INVALID") {
    return "API 키 설정을 확인한 뒤 다시 시도해 주세요.";
  }
  if (code === "OPENAI_RATE_LIMIT") return "요청이 몰려 잠시 멈췄어요. 조금 뒤 다시 진행됩니다.";
  if (code.startsWith("INPUT_")) {
    return "상품 이미지를 처리하지 못했어요. 원본 이미지를 확인해 주세요.";
  }
  if (
    code === "IMAGE_ATTEMPT_LIMIT" ||
    code === "IMAGE_CONSUMER_RETRY_EXHAUSTED" ||
    code === "IMAGE_DISPATCH_EXHAUSTED"
  ) {
    return "자동 시도를 마쳤어요. 이 장만 다시 만들 수 있습니다.";
  }
  return "이미지를 만들지 못했어요. 이 장만 다시 시도해 주세요.";
}
