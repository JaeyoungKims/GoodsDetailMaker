import {
  buildRepairPrompt,
  buildSystemPrompt,
  buildUserPrompt,
  PLAN_JSON_SCHEMA,
} from "./planPrompt.js";
import {
  BULLETS_MAX,
  IMAGE_HEIGHT,
  IMAGE_MODEL,
  IMAGE_QUALITY,
  IMAGE_WIDTH,
  RAW_RESPONSE_MAX_BYTES,
  sectionPlanListSchema,
  type ProductBrief,
  type SectionPlan,
} from "@gdm/shared";

const OPENAI_BASE = "https://api.openai.com/v1";
/** 기획(텍스트) 모델 기본값. env.PLAN_MODEL 로 덮어쓴다. */
export const PLAN_MODEL = "gpt-5-mini";

export class OpenAiError extends Error {
  constructor(
    public readonly kind:
      | "OPENAI_API_KEY_INVALID"
      | "OPENAI_RATE_LIMIT"
      | "OPENAI_PROVIDER_FAILED"
      | "IMAGE_REQUEST_REJECTED"
      | "IMAGE_RESPONSE_INVALID"
      | "IMAGE_RESPONSE_TOO_LARGE"
      | "IMAGE_NETWORK_FAILED",
    message?: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message ?? kind);
    this.name = "OpenAiError";
  }
}

function classifyStatus(status: number, retryAfter: string | null): OpenAiError {
  if (status === 401) return new OpenAiError("OPENAI_API_KEY_INVALID");
  if (status === 429) {
    const seconds = retryAfter ? Number(retryAfter) : undefined;
    return new OpenAiError("OPENAI_RATE_LIMIT", undefined, Number.isFinite(seconds) ? seconds : 30);
  }
  if (status === 400 || status === 403) return new OpenAiError("IMAGE_REQUEST_REJECTED");
  return new OpenAiError("OPENAI_PROVIDER_FAILED", `status ${status}`);
}

export interface PlanInput {
  brief: ProductBrief;
  /** 정규화된 입력 이미지(JPEG). 첫 장이 주력 제품. */
  images: Array<{ bytes: ArrayBuffer; contentType: string }>;
}

export interface PlanOptions {
  /** 기획 텍스트 모델. env.PLAN_MODEL 로 바꿀 수 있다. */
  model?: string;
  /** 검증 실패 시 수정 요청 횟수 (기본 1) */
  repairRounds?: number;
  /** 테스트 주입용 */
  fetchImpl?: typeof fetch;
}

type ResponseInputItem =
  | { role: "system" | "user" | "assistant"; content: string }
  | { role: "user"; content: Array<Record<string, unknown>> };

/**
 * 기획 1회: 13개 섹션 설계를 structured output 으로 받는다.
 * 검증에 실패하면 오류 목록을 붙여 같은 대화에서 한 번 더 고치게 한다.
 */
export async function planSections(
  apiKey: string,
  input: PlanInput,
  options: PlanOptions = {},
): Promise<SectionPlan[]> {
  const model = options.model ?? PLAN_MODEL;
  const repairRounds = options.repairRounds ?? 1;
  const fetchImpl = options.fetchImpl ?? fetch;

  const imageParts = input.images.map((img) => ({
    type: "input_image",
    image_url: `data:${img.contentType};base64,${base64(img.bytes)}`,
    detail: "low",
  }));
  const conversation: ResponseInputItem[] = [
    { role: "system", content: buildSystemPrompt() },
    {
      role: "user",
      content: [
        {
          type: "input_text",
          text: buildUserPrompt({ brief: input.brief, imageCount: input.images.length }),
        },
        ...imageParts,
      ],
    },
  ];

  let lastIssues: string[] = [];
  for (let round = 0; round <= repairRounds; round += 1) {
    const text = await requestPlan(fetchImpl, apiKey, model, conversation);
    const parsed = parsePlanText(text);
    if (parsed.ok) return parsed.sections;
    lastIssues = parsed.issues;
    conversation.push({ role: "assistant", content: text });
    conversation.push({ role: "user", content: buildRepairPrompt(parsed.issues) });
  }
  throw new OpenAiError(
    "IMAGE_RESPONSE_INVALID",
    `plan invalid after repair: ${lastIssues.slice(0, 3).join("; ")}`,
  );
}

async function requestPlan(
  fetchImpl: typeof fetch,
  apiKey: string,
  model: string,
  conversation: ResponseInputItem[],
): Promise<string> {
  const response = await fetchImpl(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      input: conversation,
      text: {
        format: {
          type: "json_schema",
          name: "detail_page_plan",
          strict: true,
          schema: PLAN_JSON_SCHEMA,
        },
      },
    }),
  }).catch(() => {
    throw new OpenAiError("IMAGE_NETWORK_FAILED");
  });
  if (!response.ok) throw classifyStatus(response.status, response.headers.get("retry-after"));
  const body = (await response.json()) as { output_text?: string; output?: unknown };
  return body.output_text ?? extractOutputText(body.output);
}

/** 모델 출력 → 가벼운 정규화 → zod 검증. 실패하면 사람이 읽을 수 있는 오류 목록을 돌려준다. */
export function parsePlanText(
  text: string,
): { ok: true; sections: SectionPlan[] } | { ok: false; issues: string[] } {
  let raw: unknown;
  try {
    raw = JSON.parse(stripCodeFence(text));
  } catch {
    return {
      ok: false,
      issues: ["출력이 JSON 이 아니다. 코드펜스·설명 없이 JSON 객체만 출력할 것."],
    };
  }
  const normalized = normalizePlan(raw);
  const result = sectionPlanListSchema.safeParse(normalized);
  if (result.success) return { ok: true, sections: result.data.sections };
  const issues = result.error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${path || "(root)"}: ${issue.message}`;
  });
  return { ok: false, issues: [...new Set(issues)] };
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
  return fenced?.[1] ?? trimmed;
}

const squash = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim() : v);

/** 공백 정리, 빈 불릿 제거, 불릿 수 제한, renderMode 기본값. 길이 초과는 고치지 않고 검증에 맡긴다. */
function normalizePlan(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { sections?: unknown }).sections))
    return raw;
  const sections = (raw as { sections: unknown[] }).sections.map((s) => {
    if (!s || typeof s !== "object") return s;
    const sec = s as Record<string, unknown>;
    const bullets = Array.isArray(sec["bullets"])
      ? sec["bullets"]
          .map(squash)
          .filter((b): b is string => typeof b === "string" && b.length > 0)
          .slice(0, BULLETS_MAX)
      : [];
    return {
      ...sec,
      headline: squash(sec["headline"]),
      subheadline: squash(sec["subheadline"] ?? ""),
      bullets,
      visualDirection: squash(sec["visualDirection"]),
      imagePrompt: squash(sec["imagePrompt"]),
      renderMode: sec["renderMode"] ?? "browser_overlay",
    };
  });
  return { sections };
}

export interface ImageInput {
  prompt: string;
  /** 주력 제품 이미지들. edits API 에 참조로 넣는다. */
  images: Array<{ bytes: ArrayBuffer; contentType: string }>;
}

/**
 * 이미지 1장: gpt-image-2 로 1024×1536 생성.
 * 원본 응답 JSON 문자열을 그대로 돌려주고 R2 에 저장한다(클라이언트가 디코드·합성).
 */
export async function generateSectionImage(apiKey: string, input: ImageInput): Promise<string> {
  const form = new FormData();
  form.set("model", IMAGE_MODEL);
  form.set("prompt", input.prompt);
  form.set("size", `${IMAGE_WIDTH}x${IMAGE_HEIGHT}`);
  form.set("quality", IMAGE_QUALITY);
  form.set("output_format", "jpeg");
  form.set("n", "1");
  input.images.forEach((img, i) => {
    form.append("image[]", new Blob([img.bytes], { type: img.contentType }), `input-${i}.jpg`);
  });

  const response = await fetch(`${OPENAI_BASE}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  }).catch(() => {
    throw new OpenAiError("IMAGE_NETWORK_FAILED");
  });

  if (!response.ok) throw classifyStatus(response.status, response.headers.get("retry-after"));

  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > RAW_RESPONSE_MAX_BYTES) throw new OpenAiError("IMAGE_RESPONSE_TOO_LARGE");
  const text = await response.text();
  if (text.length > RAW_RESPONSE_MAX_BYTES) throw new OpenAiError("IMAGE_RESPONSE_TOO_LARGE");
  return text;
}

function base64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function extractOutputText(output: unknown): string {
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      const p = part as { type?: string; text?: string };
      if (p.type === "output_text" && typeof p.text === "string") return p.text;
    }
  }
  return "";
}
