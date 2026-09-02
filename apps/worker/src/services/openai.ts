import {
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
/** 기획(텍스트) 모델. 프롬프트와 함께 추후 튜닝 대상. */
const PLAN_MODEL = "gpt-5-mini";

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

/**
 * 기획 1회: 13개 섹션 설계를 구조화 출력으로 받는다.
 * TODO(prompt): 스토리 순서(storyOrder)를 role 슬롯에 매핑하는 규칙, 금지 표현, 근거 없는 주장 억제 규칙을
 * docs/reference/detail-page-studio-analysis.md 7절 기준으로 시스템 프롬프트에 반영한다.
 */
export async function planSections(apiKey: string, input: PlanInput): Promise<SectionPlan[]> {
  const imageParts = input.images.map((img) => ({
    type: "input_image",
    image_url: `data:${img.contentType};base64,${base64(img.bytes)}`,
    detail: "low",
  }));

  const response = await fetch(`${OPENAI_BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: PLAN_MODEL,
      input: [
        { role: "system", content: PLAN_SYSTEM_PROMPT },
        {
          role: "user",
          content: [{ type: "input_text", text: JSON.stringify(input.brief) }, ...imageParts],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "detail_page_plan",
          strict: false,
          schema: PLAN_JSON_SCHEMA,
        },
      },
    }),
  }).catch(() => {
    throw new OpenAiError("IMAGE_NETWORK_FAILED");
  });

  if (!response.ok) throw classifyStatus(response.status, response.headers.get("retry-after"));

  const body = (await response.json()) as { output_text?: string; output?: unknown };
  const text = body.output_text ?? extractOutputText(body.output);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpenAiError("IMAGE_RESPONSE_INVALID", "plan is not JSON");
  }
  const result = sectionPlanListSchema.safeParse(parsed);
  if (!result.success) {
    throw new OpenAiError("IMAGE_RESPONSE_INVALID", result.error.message);
  }
  return result.data.sections;
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

const PLAN_SYSTEM_PROMPT = `당신은 한국 이커머스 상세페이지 기획자다.
상품 브리프(JSON)와 제품 사진을 보고, 구매 퍼널 13장의 설계를 JSON 으로만 출력한다.
규칙:
- sections 는 정확히 13개, index 1..13, role 은 HERO, PROBLEM, SOLUTION, BENEFIT_A, BENEFIT_B, DETAIL, USAGE, TRUST, COMPARISON, CTA, REVIEW, GIFT, PRODUCT_INFO 순서로 고정.
- storyOrder 의 i번째 단계가 index i 의 메시지 목표다.
- headline ≤ 28자, subheadline ≤ 52자, bullets ≤ 3개·각 ≤ 30자. 모두 한국어.
- 브리프에 없는 가격·할인·인증·후기·수치는 만들지 않는다. 후기 장은 "편집용 후기 초안"임을 headline 에 밝힌다.
- prohibitedClaims 에 있는 표현은 쓰지 않는다.
- imagePrompt 는 영어로, 텍스트 없는 장면 묘사만 쓴다(문구는 브라우저가 얹는다). tone 을 모든 장에 일관되게 반영한다.
- copyPlacement 는 문구가 제품을 가리지 않는 위치를 고른다.`;

const PLAN_JSON_SCHEMA = {
  type: "object",
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          role: { type: "string" },
          headline: { type: "string" },
          subheadline: { type: "string" },
          bullets: { type: "array", items: { type: "string" } },
          visualDirection: { type: "string" },
          imagePrompt: { type: "string" },
          copyPlacement: { type: "string", enum: ["top", "center", "bottom"] },
          renderMode: { type: "string", enum: ["browser_overlay", "image_model_text"] },
        },
        required: [
          "index",
          "role",
          "headline",
          "subheadline",
          "bullets",
          "visualDirection",
          "imagePrompt",
          "copyPlacement",
        ],
      },
    },
  },
  required: ["sections"],
} as const;
