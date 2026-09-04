// 마켓 썸네일용 이미지 프롬프트. 기획 모델을 거치지 않고 규칙으로 만들어 사용료를 아낀다
import { TONE_META, type AnyTone } from "@gdm/shared";
import { normalizeTone } from "./planPrompt.js";

/** 스타일별 배경·조명. 본문 이미지와 결이 맞도록 planPrompt 의 방향과 같은 어휘를 쓴다. */
const TONE_BACKDROP: Record<string, string> = {
  warm_lifestyle: "warm ivory seamless backdrop, soft natural daylight",
  cinematic: "deep charcoal backdrop, single soft spotlight, gentle falloff",
  sporty: "clean white backdrop with a subtle navy gradient, bright even light",
  premium_luxury: "matte black backdrop, precise rim lighting, champagne gold accent",
  clean_minimal: "pure white seamless backdrop, flat even studio light",
  tech_future: "graphite backdrop with a soft cyan rim light, glossy floor reflection",
  natural_organic: "cream backdrop with raw wood surface, bright diffused daylight",
  bold_pop: "solid saturated color backdrop, hard clean shadow",
};

const NO_TEXT = "no text, no letters, no numbers, no logos, no watermark, no packaging copy";
const SQUARE = "perfectly square 1:1 composition, product centered with generous margins";

export interface ThumbnailPromptInput {
  productName: string;
  category: string;
  tone: AnyTone;
  /** 옵션 썸네일이면 그 옵션명, 메인이면 전체 옵션명 목록 */
  optionName?: string;
  optionNames?: string[];
}

/** 옵션 한 개짜리 썸네일: 제품 단독 정면 컷 */
export function buildOptionThumbnailPrompt(input: ThumbnailPromptInput): string {
  const tone = normalizeTone(input.tone);
  const backdrop = TONE_BACKDROP[tone] ?? TONE_BACKDROP["clean_minimal"]!;
  const what = input.productName || input.category || "the product in the reference photo";
  const variant = input.optionName ? ` This image shows the "${input.optionName}" variant.` : "";
  return [
    `A clean commercial product photograph of ${what} for a Korean marketplace listing thumbnail.`,
    variant,
    ` The product stands alone, shot straight on, filling most of the frame on a ${backdrop}.`,
    ` Match the shape, color and finish of the reference photo exactly; do not invent parts or colors.`,
    ` ${SQUARE}. Sharp focus, true-to-life color, no props that distract from the product.`,
    ` Strictly ${NO_TEXT}.`,
  ].join("");
}

/** 메인 썸네일 AI 배치: 옵션들을 한 장면에 나란히 */
export function buildMainThumbnailPrompt(input: ThumbnailPromptInput): string {
  const tone = normalizeTone(input.tone);
  const backdrop = TONE_BACKDROP[tone] ?? TONE_BACKDROP["clean_minimal"]!;
  const what = input.productName || input.category || "the product in the reference photos";
  const names = (input.optionNames ?? []).filter(Boolean);
  const lineup = names.length
    ? ` Arrange all ${names.length} variants (${names.join(", ")}) together in one shot, evenly spaced and equally lit so each is clearly visible.`
    : " Arrange every variant shown in the reference photos together in one shot.";
  return [
    `A clean commercial group product photograph of ${what} for a Korean marketplace main thumbnail.`,
    lineup,
    ` Each item must match the shape, color and finish of its reference photo exactly; do not invent variants, parts or colors.`,
    ` Shot straight on against a ${backdrop}. ${SQUARE}.`,
    ` Sharp focus, true-to-life color, no props that distract from the products.`,
    ` Strictly ${NO_TEXT}.`,
  ].join("");
}

/** 스타일 라벨(로그·화면 표시용) */
export function thumbnailToneLabel(tone: AnyTone): string {
  return TONE_META[normalizeTone(tone)].label;
}
