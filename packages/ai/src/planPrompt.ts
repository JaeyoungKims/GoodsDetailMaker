import {
  BULLETS_MAX,
  BULLET_MAX,
  HEADLINE_MAX,
  SECTION_COUNT,
  SECTION_ROLES,
  STORY_STAGE_LABELS,
  SUBHEADLINE_MAX,
  TONE_META,
  TONES,
  type AnyTone,
  type ProductBrief,
  type StoryStage,
  type Tone,
} from "@gdm/shared";

/* ────────────────────────────────────────────────────────────────
 * 기획 프롬프트
 * - 시스템: 역할, 출력 계약, 절대 규칙, 단계별·role별·스타일별 지침
 * - 사용자: 브리프를 구조화해서 넘기고, 비어 있는 항목은 대체 규칙을 명시
 * ──────────────────────────────────────────────────────────────── */

/** 설득 단계별 메시지 목표와 근거가 없을 때의 대체 규칙 */
const STAGE_GUIDE: Record<StoryStage, { goal: string; fallback: string }> = {
  HERO: {
    goal: "가장 강한 소구점 하나를 7~14자 헤드라인으로 각인. 제품 전체 모습이 또렷하게 보이는 장면.",
    fallback: "장점 입력이 없으면 사진에서 확인되는 형태·용도에서 소구점을 뽑는다.",
  },
  PROBLEM: {
    goal: "고객이 겪는 불편·욕구를 생활 장면 한 컷으로 공감. 제품은 등장하지 않거나 작게.",
    fallback: "고객 정보가 없으면 카테고리의 일반적인 사용 맥락에서 보수적으로 잡는다.",
  },
  GAP: {
    goal: "핵심 장점 1을 '사용 전→후' 변화로 증명.",
    fallback: "장점이 하나도 없으면 사진에서 보이는 특징(재질·크기·구조) 중 첫 번째를 쓴다.",
  },
  GUIDE: {
    goal: "핵심 장점 2를 다른 생활 장면과 근거로 증명. GAP 과 장면·구도를 겹치지 않게.",
    fallback: "두 번째 장점이 없으면 첫 번째 장점의 다른 사용 상황을 보여준다.",
  },
  CORE_REASON: {
    goal: "핵심 장점 3을 한 문장 메시지로 깊게. 클로즈업이나 단면 같은 근접 장면.",
    fallback: "세 번째 장점이 없으면 '이 제품을 고르는 이유' 로 앞 장점을 종합한다.",
  },
  PLAN: {
    goal: "구조·기능·디테일을 도해처럼 보여 선택을 납득. 불릿에 구성 요소를 나열.",
    fallback: "기능 정보가 없으면 사진에 보이는 부품·버튼·마감을 묘사한다.",
  },
  OFFER: {
    goal: "확인된 가격·할인이 있을 때만 숫자를 쓴다. 미루면 잃는 시간·편의를 상기.",
    fallback:
      "가격 정보가 없으면 숫자 없이 '지금 시작하면 얻는 것' 으로 쓴다. 할인·기간 한정을 지어내지 않는다.",
  },
  SUCCESS: {
    goal: "제공된 실제 후기만 인용. 후기가 있으면 짧게 발췌하고 출처 표기.",
    fallback:
      "실제 후기가 없으면 headline 을 '편집용 후기 초안' 으로 시작하고, bullets 에 '가상 고객' 표기를 넣어 사용자가 반드시 바꾸게 한다.",
  },
  LOSS: {
    goal: "근거 있는 비교표 또는 구매 체크리스트. 경쟁사 이름은 쓰지 않는다.",
    fallback:
      "비교 근거가 없으면 '이런 분께 맞아요 / 이런 경우엔 아쉬워요' 형태의 정직한 체크리스트로 바꾼다.",
  },
  CLOSING: {
    goal: "실제 증정품이 있을 때만 구성과 혜택을 제시.",
    fallback: "증정품 정보가 없으면 '기본 구성' 을 정리하는 장으로 바꾸고 혜택을 지어내지 않는다.",
  },
  SITUATIONS: {
    goal: "제품이 문제를 해결하는 실제 사용 장면 2~3개를 한 화면에 콜라주 없이 자연스럽게.",
    fallback: "사용 맥락이 없으면 카테고리의 대표 장면 하나만 안전하게 보여준다.",
  },
  BENEFIT_ARCHIVE: {
    goal: "앞에서 증명한 장점을 3개 불릿으로 빠르게 요약. 새 주장은 넣지 않는다.",
    fallback: "앞 장들에서 실제로 사용한 장점만 다시 쓴다.",
  },
  PRODUCT_INFO: {
    goal: "구성·규격·사용 안내 등 확인 가능한 정보만. 제품 정면 컷, 여백 넉넉하게.",
    fallback: "규격 정보가 없으면 구성품과 사용 순서만 적고 수치는 비운다.",
  },
};

/** role 슬롯의 구조적 역할 — 장면 구도와 카피 형식에 대한 힌트 */
const ROLE_GUIDE: Record<(typeof SECTION_ROLES)[number], string> = {
  HERO: "전신 제품 컷, 카피 영역은 제품과 겹치지 않게.",
  PROBLEM: "사람·공간 중심, 제품은 부재하거나 작게.",
  SOLUTION: "제품이 문제를 해결하는 순간.",
  BENEFIT_A: "장점 1 을 보여주는 근접 장면.",
  BENEFIT_B: "장점 2 를 보여주는 다른 장면.",
  DETAIL: "부품·마감·구조 클로즈업.",
  USAGE: "손이 제품을 다루는 사용 장면.",
  TRUST: "정돈된 스튜디오 컷, 신뢰감.",
  COMPARISON: "여백이 많은 정면 컷 (표·체크리스트가 얹힘).",
  CTA: "제품 단독, 밝고 단순한 배경.",
  REVIEW: "생활 공간 속 제품, 따뜻한 분위기.",
  GIFT: "구성품을 펼쳐 놓은 플랫레이.",
  PRODUCT_INFO: "정면 제품 컷, 카피 영역 크게 비움.",
};

/** 스타일별 시각 방향. visualDirection 과 imagePrompt 에 반영 */
const TONE_GUIDE: Record<Tone, string> = {
  warm_lifestyle:
    "warm ivory and beige palette, soft natural window light, cozy home scenes, linen and wood textures",
  cinematic:
    "deep shadows, single spotlight, dramatic low-key lighting, dark teal and amber, film-like depth of field",
  sporty:
    "high contrast navy and red accents, dynamic diagonal angles, motion blur hints, bright clean highlights",
  premium_luxury:
    "black and champagne gold, matte surfaces, precise rim lighting, minimal props, editorial luxury",
  clean_minimal:
    "white and neutral gray, flat even lighting, generous negative space, precise grid alignment",
  tech_future:
    "graphite and cobalt, cyan light accents, glossy reflections, subtle grid lines, futuristic studio",
  natural_organic:
    "sage green and cream, plants and raw wood, bright daylight, matte natural textures",
  bold_pop:
    "vivid saturated color blocks, playful geometric shapes, hard shadows, energetic composition",
};

const LEGACY_TONE_MAP: Record<Exclude<AnyTone, Tone>, Tone> = {
  premium: "premium_luxury",
  friendly: "warm_lifestyle",
  minimal: "clean_minimal",
  energetic: "bold_pop",
};

export function normalizeTone(tone: AnyTone): Tone {
  return (TONES as readonly string[]).includes(tone)
    ? (tone as Tone)
    : LEGACY_TONE_MAP[tone as Exclude<AnyTone, Tone>];
}

export function buildSystemPrompt(): string {
  const roles = SECTION_ROLES.map((r, i) => `${i + 1}. ${r} — ${ROLE_GUIDE[r]}`).join("\n");
  return `당신은 한국 이커머스(스마트스토어·쿠팡) 상세페이지를 기획하는 시니어 카피라이터 겸 아트디렉터다.
상품 브리프(JSON)와 제품 사진을 보고 구매 퍼널 ${SECTION_COUNT}장의 설계를 JSON 으로만 출력한다. 설명, 마크다운, 코드펜스는 쓰지 않는다.

## 출력 계약
- sections 는 정확히 ${SECTION_COUNT}개. index 는 1..${SECTION_COUNT} 순서대로. role 은 아래 슬롯 순서로 고정한다.
${roles}
- 사용자 메시지의 storyOrder 에서 i번째 단계가 index i 의 "메시지 목표" 다. role 은 장면 구도, storyOrder 는 무엇을 설득할지를 정한다. 두 축을 모두 만족시켜라.
- headline ≤ ${HEADLINE_MAX}자, subheadline ≤ ${SUBHEADLINE_MAX}자(비워도 됨), bullets ≤ ${BULLETS_MAX}개·각 ≤ ${BULLET_MAX}자. 모두 자연스러운 한국어 구어체, 마침표 없이, 이모지 없이.
- visualDirection: ${SECTION_COUNT}장 전체에 공통으로 적용할 디자인 시스템을 한 문단(≤400자)으로 쓰고, 모든 섹션에 **완전히 같은 문자열**을 넣는다.
- imagePrompt: 영어 60~140단어. 텍스트·글자·로고·워터마크·UI 요소가 없는 장면만 묘사한다(문구는 브라우저가 얹는다). 2:3 세로 구도. 반드시 "no text, no letters, no logos, no watermark" 를 포함한다.
- copyPlacement: 카피가 제품 핵심부를 가리지 않는 위치. 제품이 아래쪽이면 top, 위쪽이면 bottom, 좌우로 치우치면 center. 장면 묘사에 그 영역을 비우라는 지시를 포함한다.
- renderMode: 기본 "browser_overlay". 카피가 이미지 안에 그래픽으로 녹아야만 하는 장(예: 비교표)에 한해 "image_model_text" 를 쓸 수 있으나, 이 경우에도 한글 오탈자 위험이 있으므로 정말 필요할 때만.

## 절대 규칙 (위반하면 결과를 쓸 수 없다)
1. 브리프에 없는 가격·할인·기간·인증·수상·후기·수치·비교 우위는 만들지 않는다. 근거(evidence)에 있는 것만 숫자로 쓴다.
2. prohibitedClaims 의 표현과 그 유사 표현을 쓰지 않는다. 의료·치료 효능, "100%", "최고", "1위", 경쟁사 이름은 근거가 있어도 피한다.
3. 제품 외형·색상·구성은 제공된 사진과 일치시킨다. 사진에 없는 부속품·색상을 상상하지 않는다. 첫 번째 사진이 주력 제품이다.
4. 스타일(tone)의 색·조명·소품 방향을 ${SECTION_COUNT}장 전체에 일관되게 유지하되, 장마다 장면과 구도는 달라야 한다. 같은 구도를 반복하지 않는다.
5. 후기·증정·가격 정보가 없으면 각 단계의 대체 규칙을 따른다. 해당 장을 비우거나 건너뛰지 않는다.

## 단계별 지침 (storyOrder 의 각 단계)
${STORY_STAGES_TEXT()}

## 스타일별 시각 방향
${TONES.map((t) => `- ${t} (${TONE_META[t].label}): ${TONE_GUIDE[t]}`).join("\n")}

## 카피 작법
- headline 은 혜택 중심, 고객 언어. 기능 이름보다 "그래서 무엇이 좋아지는지".
- subheadline 은 headline 을 뒷받침하는 한 문장. 없어도 되면 빈 문자열.
- bullets 는 명사형 또는 짧은 구. 근거가 있을 때만 숫자를 넣는다.
- 13장을 위에서 아래로 읽었을 때 한 편의 이야기가 되도록 앞 장의 내용을 이어받는다.`;
}

function STORY_STAGES_TEXT(): string {
  return (Object.keys(STAGE_GUIDE) as StoryStage[])
    .map(
      (s) =>
        `- ${s} (${STORY_STAGE_LABELS[s]}): ${STAGE_GUIDE[s].goal} / 정보 없을 때: ${STAGE_GUIDE[s].fallback}`,
    )
    .join("\n");
}

export interface BriefContext {
  brief: ProductBrief;
  imageCount: number;
}

/** 브리프를 모델이 오해하지 않도록 구조화하고, 비어 있는 항목에는 대체 규칙을 붙인다 */
export function buildUserPrompt({ brief, imageCount }: BriefContext): string {
  const tone = normalizeTone(brief.tone);
  const lines: string[] = [];
  lines.push("## 상품 브리프");
  lines.push(
    `- 상품명: ${brief.productName || "(미입력 — 사진에서 추정하되 브랜드명은 지어내지 말 것)"}`,
  );
  lines.push(`- 카테고리: ${brief.category || "(미입력 — 사진으로 판단)"}`);
  lines.push(
    `- 주요 고객: ${brief.targetCustomer || "(미입력 — 사진에서 확인되는 사용 맥락으로 보수적으로 설정)"}`,
  );
  lines.push(
    brief.coreBenefits.length
      ? `- 핵심 장점 (이 순서로 GAP→GUIDE→CORE_REASON 에 배정):\n${brief.coreBenefits.map((b, i) => `  ${i + 1}. ${b}`).join("\n")}`
      : "- 핵심 장점: (미입력 — 사진에서 보이는 특징만 사용, 성능 수치 금지)",
  );
  lines.push(
    brief.evidence.length
      ? `- 사용 가능한 근거 (이것만 숫자·인증으로 인용 가능):\n${brief.evidence.map((e) => `  · ${e}`).join("\n")}`
      : "- 사용 가능한 근거: (없음 — 어떤 수치·인증·후기도 쓰지 말 것. SUCCESS 는 '편집용 후기 초안' 규칙, OFFER 는 숫자 없이)",
  );
  lines.push(
    brief.prohibitedClaims.length
      ? `- 금지 표현:\n${brief.prohibitedClaims.map((p) => `  · ${p}`).join("\n")}`
      : "- 금지 표현: (추가 없음 — 절대 규칙의 기본 금지만 적용)",
  );
  lines.push(`- 스타일(tone): ${tone} — ${TONE_META[tone].label}. ${TONE_GUIDE[tone]}`);
  if (brief.additionalNotes)
    lines.push(`- 추가 메모 (장면 요청 등, 사실 주장으로 쓰지 말 것): ${brief.additionalNotes}`);
  lines.push("");
  lines.push("## storyOrder (index i 의 메시지 목표)");
  brief.storyOrder.forEach((stage, i) => {
    lines.push(`${i + 1}. ${stage} — ${STORY_STAGE_LABELS[stage]} → role 슬롯 ${SECTION_ROLES[i]}`);
  });
  lines.push("");
  lines.push(`## 제품 사진: ${imageCount}장 첨부. 1번이 주력 제품. 외형·색상은 사진을 따를 것.`);
  lines.push("");
  lines.push("위 계약과 규칙을 지켜 JSON 만 출력하라.");
  return lines.join("\n");
}

/** 검증 실패 시 같은 대화에 이어 붙이는 수정 요청 */
export function buildRepairPrompt(issues: string[]): string {
  return [
    "방금 출력한 JSON 이 검증에 실패했다. 아래 문제만 고쳐서 전체 JSON 을 다시 출력하라. 다른 내용은 바꾸지 마라.",
    ...issues.slice(0, 20).map((i) => `- ${i}`),
  ].join("\n");
}

/** Responses API structured output 용 strict 스키마 */
export const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          index: { type: "integer" },
          role: { type: "string", enum: [...SECTION_ROLES] },
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
          "renderMode",
        ],
      },
    },
  },
  required: ["sections"],
} as const;
