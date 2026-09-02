export const TONES = [
  "warm_lifestyle",
  "cinematic",
  "sporty",
  "premium_luxury",
  "clean_minimal",
  "tech_future",
  "natural_organic",
  "bold_pop",
] as const;
export type Tone = (typeof TONES)[number];

/** 과거 작업 호환용. 신규 UI에는 노출하지 않는다. */
export const LEGACY_TONES = ["premium", "friendly", "minimal", "energetic"] as const;
export type AnyTone = Tone | (typeof LEGACY_TONES)[number];

export interface ToneMeta {
  label: string;
  eyebrow: string;
  description: string;
  keywords: string;
}

export const TONE_META: Record<Tone, ToneMeta> = {
  warm_lifestyle: {
    label: "따뜻한 라이프스타일",
    eyebrow: "WARM LIFESTYLE",
    description: "부드러운 햇살과 아이보리 톤으로 편안한 일상을 보여줘요.",
    keywords: "웜 아이보리 · 자연광 · 포근한 생활 장면",
  },
  cinematic: {
    label: "시네마틱",
    eyebrow: "CINEMATIC",
    description: "영화 같은 명암과 깊이감으로 제품의 존재감을 강하게 만들어요.",
    keywords: "딥 섀도 · 스포트라이트 · 드라마틱 구도",
  },
  sporty: {
    label: "스포티",
    eyebrow: "SPORTY ENERGY",
    description: "빠른 움직임과 선명한 대비로 역동적인 에너지를 전달해요.",
    keywords: "다이내믹 앵글 · 모션 라인 · 강한 대비",
  },
  premium_luxury: {
    label: "프리미엄 럭셔리",
    eyebrow: "PREMIUM LUXURY",
    description: "절제된 어둠과 고급 소재감으로 한 단계 높은 인상을 만들어요.",
    keywords: "블랙 · 샴페인 골드 · 정교한 하이라이트",
  },
  clean_minimal: {
    label: "클린 미니멀",
    eyebrow: "CLEAN MINIMAL",
    description: "깨끗한 여백과 정교한 그리드로 핵심만 또렷하게 보여줘요.",
    keywords: "화이트 · 뉴트럴 그레이 · 정돈된 정보",
  },
  tech_future: {
    label: "테크·퓨처",
    eyebrow: "TECH FUTURE",
    description: "정밀한 빛과 미래적인 그래픽으로 기술적 신뢰를 강조해요.",
    keywords: "그래파이트 · 코발트 · 시안 라이트",
  },
  natural_organic: {
    label: "내추럴 오가닉",
    eyebrow: "NATURAL ORGANIC",
    description: "자연 소재와 맑은 채광으로 건강하고 편안한 감각을 만들어요.",
    keywords: "세이지 · 크림 · 나무와 자연 질감",
  },
  bold_pop: {
    label: "볼드 팝",
    eyebrow: "BOLD POP",
    description: "대담한 컬러와 큰 타이포로 한눈에 기억되는 화면을 만들어요.",
    keywords: "비비드 컬러 · 컬러 블록 · 리듬감",
  },
};
