import { API_ERROR_CODES, copyVersionConflictSchema, type ApiErrorCode } from "@gdm/shared";

export class ApiRequestError extends Error {
  constructor(
    public readonly code:
      ApiErrorCode | "JOB_REQUEST_FAILED" | "JOB_REQUEST_ABORTED" | "JOB_RESPONSE_INVALID",
    public readonly status?: number,
  ) {
    super(code);
    this.name = "ApiRequestError";
  }
}

export class CopyVersionConflictError extends Error {
  constructor(public readonly currentCopyVersion: number) {
    super("COPY_VERSION_CONFLICT");
    this.name = "CopyVersionConflictError";
  }
}

const knownCodes = new Set<string>(API_ERROR_CODES);

/**
 * /api 를 호출하고 JSON 을 돌려준다. 인증은 HttpOnly 쿠키 세션이다.
 * 서버 에러는 `{ error: CODE }` 를 ApiRequestError 로, 409 카피 충돌은 CopyVersionConflictError 로 바꾼다.
 */
export async function apiFetch<T = unknown>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
    void accessToken; // 쿠키 세션. 매개변수는 호출부 호환용으로 남긴다.
  } catch {
    throw new ApiRequestError(init.signal?.aborted ? "JOB_REQUEST_ABORTED" : "JOB_REQUEST_FAILED");
  }
  if (response.status === 204) return undefined as T;

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new ApiRequestError("JOB_RESPONSE_INVALID", response.status);
  }
  if (!response.ok) {
    const conflict = copyVersionConflictSchema.safeParse(body);
    if (response.status === 409 && conflict.success) {
      throw new CopyVersionConflictError(conflict.data.currentCopyVersion);
    }
    const code = (body as { error?: unknown } | null)?.error;
    throw new ApiRequestError(
      typeof code === "string" && knownCodes.has(code)
        ? (code as ApiErrorCode)
        : "JOB_REQUEST_FAILED",
      response.status,
    );
  }
  return body as T;
}
