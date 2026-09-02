import { IMAGE_HEIGHT, IMAGE_WIDTH, type CopyPlacement, type SectionCopy } from "@gdm/shared";
import { ComposeError } from "./rawResponse";

/** 카피 영역 규격 (참고 분석 6.1절) */
export const CANVAS_WIDTH = IMAGE_WIDTH;
export const CANVAS_HEIGHT = IMAGE_HEIGHT;
export const ZONE_HEIGHT = 720;
export const PAD_X = 80;
export const TEXT_WIDTH = 864;
export const PAD_Y = 72;
export const BULLET_INDENT = 36;

export type MeasureFn = (text: string, fontSize: number, weight: number) => number;

export interface LayoutLine {
  kind: "headline" | "subheadline" | "bullet";
  firstInBlock: boolean;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: number;
}

export interface CopyLayout {
  zoneTop: number;
  zoneHeight: number;
  lines: LayoutLine[];
}

export function zoneTop(placement: CopyPlacement): number {
  if (placement === "top") return 0;
  if (placement === "center") return (CANVAS_HEIGHT - ZONE_HEIGHT) / 2;
  return CANVAS_HEIGHT - ZONE_HEIGHT;
}

/** 한글·이모지 안전한 글자 단위 분할 */
export function graphemes(text: string): string[] {
  if (typeof Intl.Segmenter === "function") {
    return Array.from(
      new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text),
      (s) => s.segment,
    );
  }
  return Array.from(text);
}

/** 폭을 넘지 않도록 줄을 나눈다. 공백에서 먼저 끊고, 한 단어가 너무 길면 글자 단위로 끊는다. */
export function wrapLine(text: string, maxWidth: number, measure: (t: string) => number): string[] {
  if (text === "") return [""];
  const lines: string[] = [];
  let current = "";
  const pushChars = (word: string) => {
    for (const ch of graphemes(word)) {
      const next = current + ch;
      if (current && measure(next) > maxWidth) {
        lines.push(current);
        current = ch;
      } else {
        current = next;
      }
    }
  };
  for (const word of text.split(" ")) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
    } else if (measure(word) <= maxWidth) {
      if (current) lines.push(current);
      current = word;
    } else {
      if (current) {
        lines.push(current);
        current = "";
      }
      pushChars(word);
    }
  }
  if (current) lines.push(current);
  return lines;
}

function wrapText(text: string, maxWidth: number, measure: (t: string) => number): string[] {
  if (!Number.isFinite(maxWidth) || maxWidth <= 0) throw new ComposeError("COPY_LAYOUT_FAILED");
  return text.split("\n").flatMap((line) => wrapLine(line, maxWidth, measure));
}

/**
 * 카피 배치 계산. 영역(720px)에 들어갈 때까지 1.8% 씩 최대 36단계 축소한다.
 * 헤드라인 700/72, 서브 400/36(gap 24), 불릿 400/30(첫 gap 30, 이후 10), 줄간 1.3.
 */
export function layoutCopy(
  copy: SectionCopy & { copyPlacement: CopyPlacement },
  measure: MeasureFn,
): CopyLayout {
  const top = zoneTop(copy.copyPlacement);
  const blocks = [
    { kind: "headline" as const, text: copy.headline, weight: 700, baseSize: 72, gap: 0 },
    ...(copy.subheadline
      ? [
          {
            kind: "subheadline" as const,
            text: copy.subheadline,
            weight: 400,
            baseSize: 36,
            gap: 24,
          },
        ]
      : []),
    ...copy.bullets.map((text, i) => ({
      kind: "bullet" as const,
      text,
      weight: 400,
      baseSize: 30,
      gap: i === 0 ? 30 : 10,
    })),
  ];

  for (let step = 0; step <= 36; step += 1) {
    const scale = 1 - step * 0.018;
    const sized = blocks.map((block) => {
      const fontSize = Math.max(18, Math.round(block.baseSize * scale));
      const maxWidth = block.kind === "bullet" ? TEXT_WIDTH - BULLET_INDENT : TEXT_WIDTH;
      const lines = wrapText(block.text, maxWidth, (t) => measure(t, fontSize, block.weight));
      return {
        ...block,
        fontSize,
        lines,
        lineHeight: Math.ceil(fontSize * 1.3),
        gap: Math.round(block.gap * scale),
        fits: lines.every((l) => measure(l, fontSize, block.weight) <= maxWidth),
      };
    });
    const total = sized.reduce((sum, b) => sum + b.gap + b.lines.length * b.lineHeight, 0);
    if (total > ZONE_HEIGHT - PAD_Y * 2 || sized.some((b) => !b.fits)) continue;

    let y = top + (ZONE_HEIGHT - total) / 2;
    const lines: LayoutLine[] = [];
    for (const block of sized) {
      y += block.gap;
      block.lines.forEach((text, i) => {
        lines.push({
          kind: block.kind,
          firstInBlock: i === 0,
          text,
          x: block.kind === "bullet" ? PAD_X + BULLET_INDENT : PAD_X,
          y: y + block.lineHeight * 0.82,
          fontSize: block.fontSize,
          fontWeight: block.weight,
        });
        y += block.lineHeight;
      });
    }
    return { zoneTop: top, zoneHeight: ZONE_HEIGHT, lines };
  }
  throw new ComposeError("COPY_LAYOUT_FAILED");
}
