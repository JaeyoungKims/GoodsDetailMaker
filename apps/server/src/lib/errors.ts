import type { ApiErrorCode } from "@gdm/shared";

/** 라우트에서 throw 하면 onError 가 `{ error: code }` JSON 으로 바꾼다 */
export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    public readonly status: number = 400,
    public readonly extra: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = "ApiError";
  }
}
