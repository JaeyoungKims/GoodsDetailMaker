import {
  inputStoredSchema,
  jobCreatedSchema,
  jobSchema,
  jobStartedSchema,
  sectionCopyUpdateSchema,
  sectionCopyUpdatedSchema,
  sectionFeedbackSchema,
  sectionFeedbackUpdatedSchema,
  sectionRetrySchema,
  thumbnailQueuedSchema,
  type Job,
  type ThumbnailKind,
  type ProductBriefInput,
  type SectionCopyUpdate,
} from "@gdm/shared";
import { ApiRequestError, apiFetch } from "./http";

function parseOr<T>(result: { success: true; data: T } | { success: false }): T {
  if (!result.success) throw new ApiRequestError("JOB_RESPONSE_INVALID");
  return result.data;
}

/** 작업 API 클라이언트. 모든 응답을 zod 로 검증해 서버 계약 위반을 즉시 드러낸다. */
export const jobsApi = {
  async create(token: string, jobId: string, brief: ProductBriefInput) {
    const body = await apiFetch(token, "/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": jobId },
      body: JSON.stringify(brief),
    });
    const created = parseOr(jobCreatedSchema.safeParse(body));
    if (created.id !== jobId) throw new ApiRequestError("JOB_RESPONSE_INVALID");
    return created;
  },

  async upload(
    token: string,
    jobId: string,
    inputId: string,
    file: File,
    role: "product" | "option" = "product",
  ) {
    const body = await apiFetch(token, `/api/jobs/${jobId}/inputs/${inputId}?role=${role}`, {
      method: "PUT",
      headers: { "Content-Type": file.type, "x-file-size": String(file.size) },
      body: file,
    });
    return parseOr(inputStoredSchema.safeParse(body));
  },

  async start(token: string, jobId: string) {
    const body = await apiFetch(token, `/api/jobs/${jobId}/start`, { method: "POST" });
    return parseOr(jobStartedSchema.safeParse(body));
  },

  async get(token: string, jobId: string, signal?: AbortSignal): Promise<Job> {
    const body = await apiFetch(token, `/api/jobs/${jobId}`, { signal: signal ?? null });
    const job = parseOr(jobSchema.safeParse(body));
    if (job.jobId !== jobId) throw new ApiRequestError("JOB_RESPONSE_INVALID");
    return job;
  },

  async retry(token: string, jobId: string, sectionIndex: number, signal?: AbortSignal) {
    const body = await apiFetch(token, `/api/jobs/${jobId}/sections/${sectionIndex}/retry`, {
      method: "POST",
      signal: signal ?? null,
    });
    return parseOr(sectionRetrySchema.safeParse(body));
  },

  async updateCopy(token: string, jobId: string, sectionIndex: number, copy: SectionCopyUpdate) {
    const valid = sectionCopyUpdateSchema.safeParse(copy);
    if (!valid.success) throw new ApiRequestError("INVALID_SECTION_COPY");
    const body = await apiFetch(token, `/api/jobs/${jobId}/sections/${sectionIndex}/copy`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid.data),
    });
    const updated = parseOr(sectionCopyUpdatedSchema.safeParse(body));
    if (updated.section.copyVersion !== valid.data.expectedCopyVersion + 1) {
      throw new ApiRequestError("JOB_RESPONSE_INVALID");
    }
    return updated;
  },

  /** 장별 고칠 점 메모 저장. 다음 재생성 때 반영된다. */
  async updateFeedback(token: string, jobId: string, sectionIndex: number, feedback: string) {
    const valid = sectionFeedbackSchema.safeParse({ feedback });
    if (!valid.success) throw new ApiRequestError("INVALID_SECTION_COPY");
    const body = await apiFetch(token, `/api/jobs/${jobId}/sections/${sectionIndex}/feedback`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(valid.data),
    });
    return parseOr(sectionFeedbackUpdatedSchema.safeParse(body));
  },

  /** 메인 썸네일을 AI 로 한 장면에 배치하도록 요청한다 (기본 메인은 브라우저 격자 합성) */
  async requestMainThumbnail(token: string, jobId: string) {
    const body = await apiFetch(token, `/api/jobs/${jobId}/thumbnails/main`, {
      method: "POST",
    });
    return parseOr(thumbnailQueuedSchema.safeParse(body));
  },

  async retryThumbnail(
    token: string,
    jobId: string,
    kind: ThumbnailKind,
    optionIndex: number,
    signal?: AbortSignal,
  ) {
    const body = await apiFetch(
      token,
      `/api/jobs/${jobId}/thumbnails/${kind}/${optionIndex}/retry`,
      { method: "POST", signal: signal ?? null },
    );
    return parseOr(thumbnailQueuedSchema.safeParse(body));
  },

  /** 썸네일 원본 응답 JSON 문자열 */
  async thumbnailRaw(
    token: string,
    jobId: string,
    kind: ThumbnailKind,
    optionIndex: number,
    signal?: AbortSignal,
  ) {
    void token;
    const response = await fetch(`/api/jobs/${jobId}/thumbnails/${kind}/${optionIndex}/raw`, {
      credentials: "include",
      signal: signal ?? null,
    });
    if (!response.ok) {
      throw new ApiRequestError(
        response.status === 404 ? "ARTIFACT_NOT_FOUND" : "JOB_REQUEST_FAILED",
      );
    }
    return response.text();
  },

  /** OpenAI 원본 응답 JSON 문자열. 디코드·합성은 features/compose 에서. */
  async raw(token: string, jobId: string, sectionIndex: number, signal?: AbortSignal) {
    void token;
    const response = await fetch(`/api/jobs/${jobId}/sections/${sectionIndex}/raw`, {
      credentials: "include",
      signal: signal ?? null,
    });
    if (!response.ok) {
      throw new ApiRequestError(
        response.status === 404 ? "ARTIFACT_NOT_FOUND" : "JOB_REQUEST_FAILED",
      );
    }
    return response.text();
  },
};
