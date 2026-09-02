/**
 * 섹션 role: 기획 모델에게 주는 구조적 역할. index 1..13 슬롯에 고정된다.
 * (사용자가 재배열하는 storyOrder 와는 별개 축)
 */
export const SECTION_ROLES = [
  "HERO",
  "PROBLEM",
  "SOLUTION",
  "BENEFIT_A",
  "BENEFIT_B",
  "DETAIL",
  "USAGE",
  "TRUST",
  "COMPARISON",
  "CTA",
  "REVIEW",
  "GIFT",
  "PRODUCT_INFO",
] as const;
export type SectionRole = (typeof SECTION_ROLES)[number];

export const SECTION_ROLE_LABELS: Record<SectionRole, string> = {
  HERO: "첫인상",
  PROBLEM: "고객 고민",
  SOLUTION: "해결 방법",
  BENEFIT_A: "핵심 장점 1",
  BENEFIT_B: "핵심 장점 2",
  DETAIL: "상품 디테일",
  USAGE: "사용 방법",
  TRUST: "신뢰 근거",
  COMPARISON: "비교 포인트",
  CTA: "구매 제안",
  REVIEW: "사용 상황",
  GIFT: "장점 모아보기",
  PRODUCT_INFO: "상품 정보",
};

/** 설득 단계: 사용자가 순서를 바꿀 수 있는 13단계 스토리 흐름 */
export const STORY_STAGES = [
  "HERO",
  "PROBLEM",
  "GAP",
  "GUIDE",
  "CORE_REASON",
  "PLAN",
  "OFFER",
  "SUCCESS",
  "LOSS",
  "CLOSING",
  "SITUATIONS",
  "BENEFIT_ARCHIVE",
  "PRODUCT_INFO",
] as const;
export type StoryStage = (typeof STORY_STAGES)[number];

export const DEFAULT_STORY_ORDER: readonly StoryStage[] = [...STORY_STAGES];

export const STORY_STAGE_LABELS: Record<StoryStage, string> = {
  HERO: "1. 후킹멘트",
  PROBLEM: "2. 공감대 유발",
  GAP: "3. 핵심 장점 1",
  GUIDE: "4. 핵심 장점 2",
  CORE_REASON: "5. 핵심 장점 3",
  PLAN: "6. 이 제품을 써야 하는 이유",
  OFFER: "7. 가격·손실 회피",
  SUCCESS: "8. 실제 후기",
  LOSS: "9. 비교·선택 근거",
  CLOSING: "10. 증정 혜택",
  SITUATIONS: "11. 실제 사용 상황",
  BENEFIT_ARCHIVE: "12. 혜택 총정리",
  PRODUCT_INFO: "13. 제품 정보",
};

export const STORY_STAGE_DESCRIPTIONS: Record<StoryStage, string> = {
  HERO: "핵심 소구점 하나와 제품 전체 모습을 깨끗하게 각인",
  PROBLEM: "고객이 실제 생활에서 겪는 불편과 욕구를 구체화",
  GAP: "첫 번째 핵심 장점을 제품이 만드는 변화로 증명",
  GUIDE: "두 번째 핵심 장점을 다른 생활 장면과 근거로 증명",
  CORE_REASON: "세 번째 핵심 장점을 한 메시지로 깊게 증명",
  PLAN: "구조·기능·디테일로 제품을 선택할 이유를 납득",
  OFFER: "확인된 가격·할인만 사용하고 미룰 비용을 상기",
  SUCCESS: "제공된 실제 후기만 사용해 사회적 증거를 제시",
  LOSS: "근거 있는 비교표나 구매 체크리스트로 선택을 도움",
  CLOSING: "실제 증정품이 있을 때만 구성과 혜택을 선명하게 제시",
  SITUATIONS: "제품이 문제를 해결하는 실제 사용 장면을 다양하게 제시",
  BENEFIT_ARCHIVE: "앞서 증명한 혜택을 빠르게 훑는 요약 아카이브",
  PRODUCT_INFO: "구성·규격·사용 안내 등 확인 가능한 구매 정보를 정리",
};
