// 이미지 위에 문구를 얹는 방식(카피 디자인). 작업 하나에 한 가지를 적용한다
export const COPY_STYLES = ["gradient", "card", "band", "minimal"] as const;
export type CopyStyle = (typeof COPY_STYLES)[number];

export const COPY_STYLE_DEFAULT: CopyStyle = "gradient";

export interface CopyStyleMeta {
  label: string;
  description: string;
  /** 선택 칩에 보여줄 축소 미리보기 (글자 색 / 판 색) */
  ink: string;
  plate: string;
}

export const COPY_STYLE_META: Record<CopyStyle, CopyStyleMeta> = {
  gradient: {
    label: "그라데이션",
    description: "사진이 문구 쪽으로 자연스럽게 어두워져요. 어떤 사진에도 무난해요.",
    ink: "#ffffff",
    plate: "linear-gradient(180deg, rgba(0,0,0,0.08), rgba(0,0,0,0.82))",
  },
  card: {
    label: "카드",
    description: "흰 카드 위에 문구를 올려요. 정보가 또렷하게 읽혀요.",
    ink: "#1b1b1b",
    plate: "linear-gradient(180deg, rgba(0,0,0,0.06), rgba(0,0,0,0.06)), #ffffff",
  },
  band: {
    label: "단색 띠",
    description: "문구 영역을 진한 띠로 덮어요. 사진이 복잡할 때 좋아요.",
    ink: "#ffffff",
    plate: "#141414",
  },
  minimal: {
    label: "글자만",
    description: "글자 자리만 아주 옅게 덮어요. 사진을 최대한 살리고 싶을 때 써요.",
    ink: "#ffffff",
    plate: "linear-gradient(180deg, rgba(0,0,0,0.10), rgba(0,0,0,0.10))",
  },
};
