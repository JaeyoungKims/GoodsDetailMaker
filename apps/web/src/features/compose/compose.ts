import {
  COPY_STYLE_DEFAULT,
  sectionCopySchema,
  sectionPlanSchema,
  type CopyStyle,
  type Section,
} from "@gdm/shared";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  PAD_X,
  TEXT_WIDTH,
  layoutCopy,
  type CopyLayout,
} from "./layout";
import { ComposeError, decodeRawResponse } from "./rawResponse";

const PRIMARY_FAMILY = "Noto Sans KR";
const FALLBACK_STACK = `"${PRIMARY_FAMILY}", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif`;

let fontReady: Promise<boolean> | null = null;

/** Noto Sans KR 로드를 시도한다. 없으면 시스템 한글 폰트로 대체하고 false 를 돌려준다. */
export function ensureFont(): Promise<boolean> {
  if (!fontReady) {
    fontReady = (async () => {
      try {
        const faces = await Promise.all([
          document.fonts.load(`700 72px "${PRIMARY_FAMILY}"`, "가"),
          document.fonts.load(`400 36px "${PRIMARY_FAMILY}"`, "가"),
        ]);
        await document.fonts.ready;
        return faces.every((list) =>
          list.some((f) => f.family.replace(/^["']|["']$/g, "") === PRIMARY_FAMILY),
        );
      } catch {
        return false;
      }
    })();
  }
  return fontReady;
}

function drawCover(ctx: CanvasRenderingContext2D, bitmap: ImageBitmap) {
  const target = CANVAS_WIDTH / CANVAS_HEIGHT;
  const source = bitmap.width / bitmap.height;
  let sx = 0,
    sy = 0,
    sw = bitmap.width,
    sh = bitmap.height;
  if (source > target) {
    sw = bitmap.height * target;
    sx = (bitmap.width - sw) / 2;
  } else if (source < target) {
    sh = bitmap.width / target;
    sy = (bitmap.height - sh) / 2;
  }
  ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
}

/** 카드 스타일은 판 안쪽에 글자를 두므로 좌우 여백을 더 준다 */
const CARD_INSET = 44;

interface StylePaint {
  ink: string;
  bulletInk: string;
  shadow: { color: string; blur: number; offsetY: number } | null;
  padX: number;
  textWidth: number;
  /** 글자 뒤에 깔 판. 레이아웃을 알아야 그릴 수 있는 것도 있다. */
  plate: ((ctx: CanvasRenderingContext2D, layout: CopyLayout, section: Section) => void) | null;
}

function gradientPlate(ctx: CanvasRenderingContext2D, layout: CopyLayout, section: Section) {
  const gradient = ctx.createLinearGradient(
    0,
    layout.zoneTop,
    0,
    layout.zoneTop + layout.zoneHeight,
  );
  if (section.copyPlacement === "top") {
    gradient.addColorStop(0, "rgba(0,0,0,0.80)");
    gradient.addColorStop(0.72, "rgba(0,0,0,0.58)");
    gradient.addColorStop(1, "rgba(0,0,0,0.08)");
  } else if (section.copyPlacement === "bottom") {
    gradient.addColorStop(0, "rgba(0,0,0,0.08)");
    gradient.addColorStop(0.28, "rgba(0,0,0,0.58)");
    gradient.addColorStop(1, "rgba(0,0,0,0.80)");
  } else {
    gradient.addColorStop(0, "rgba(0,0,0,0.18)");
    gradient.addColorStop(0.5, "rgba(0,0,0,0.76)");
    gradient.addColorStop(1, "rgba(0,0,0,0.18)");
  }
  ctx.fillStyle = gradient;
  ctx.fillRect(0, layout.zoneTop, CANVAS_WIDTH, layout.zoneHeight);
}

/** 글자가 실제로 차지한 세로 범위 (판 크기를 맞추는 데 쓴다) */
function textBounds(layout: CopyLayout): { top: number; bottom: number } {
  if (layout.lines.length === 0) {
    return { top: layout.zoneTop, bottom: layout.zoneTop + layout.zoneHeight };
  }
  const first = layout.lines[0]!;
  const last = layout.lines[layout.lines.length - 1]!;
  return { top: first.y - first.fontSize, bottom: last.y + last.fontSize * 0.32 };
}

function cardPlate(ctx: CanvasRenderingContext2D, layout: CopyLayout) {
  const { top, bottom } = textBounds(layout);
  const x = PAD_X - CARD_INSET;
  const y = top - 40;
  const w = CANVAS_WIDTH - x * 2;
  const h = bottom - top + 80;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.22)";
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 8;
  ctx.fillStyle = "rgba(255,255,255,0.94)";
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 28);
  ctx.fill();
  ctx.restore();
}

function bandPlate(ctx: CanvasRenderingContext2D, layout: CopyLayout) {
  const { top, bottom } = textBounds(layout);
  const y = Math.max(layout.zoneTop, top - 56);
  const h = Math.min(layout.zoneTop + layout.zoneHeight, bottom + 56) - y;
  ctx.fillStyle = "rgba(18,18,18,0.90)";
  ctx.fillRect(0, y, CANVAS_WIDTH, h);
}

/** 글자가 놓인 자리만 아주 옅게 어둡게. 사진을 거의 가리지 않으면서 흰 글자를 읽히게 한다. */
function softPlate(ctx: CanvasRenderingContext2D, layout: CopyLayout) {
  const { top, bottom } = textBounds(layout);
  const pad = 64;
  const y = Math.max(0, top - pad);
  const h = Math.min(CANVAS_HEIGHT, bottom + pad) - y;
  const gradient = ctx.createLinearGradient(0, y, 0, y + h);
  gradient.addColorStop(0, "rgba(0,0,0,0.00)");
  gradient.addColorStop(0.18, "rgba(0,0,0,0.40)");
  gradient.addColorStop(0.82, "rgba(0,0,0,0.40)");
  gradient.addColorStop(1, "rgba(0,0,0,0.00)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, y, CANVAS_WIDTH, h);
}

const STYLE_PAINT: Record<CopyStyle, StylePaint> = {
  gradient: {
    ink: "#ffffff",
    bulletInk: "#ffffff",
    shadow: { color: "rgba(0,0,0,0.42)", blur: 8, offsetY: 2 },
    padX: PAD_X,
    textWidth: TEXT_WIDTH,
    plate: gradientPlate,
  },
  card: {
    ink: "#1b1b1b",
    bulletInk: "#7c6cf0",
    shadow: null,
    padX: PAD_X,
    textWidth: TEXT_WIDTH - CARD_INSET,
    plate: (ctx, layout) => cardPlate(ctx, layout),
  },
  band: {
    ink: "#ffffff",
    bulletInk: "#ffffff",
    shadow: null,
    padX: PAD_X,
    textWidth: TEXT_WIDTH,
    plate: (ctx, layout) => bandPlate(ctx, layout),
  },
  minimal: {
    ink: "#ffffff",
    bulletInk: "#ffffff",
    shadow: { color: "rgba(0,0,0,0.80)", blur: 20, offsetY: 3 },
    padX: PAD_X,
    textWidth: TEXT_WIDTH,
    // 덮개를 완전히 없애면 밝은 사진에서 흰 글자가 묻힌다. 글자 뒤만 옅게 깐다.
    plate: (ctx, layout) => softPlate(ctx, layout),
  },
};

function drawCopy(ctx: CanvasRenderingContext2D, section: Section, style: CopyStyle) {
  const paint = STYLE_PAINT[style] ?? STYLE_PAINT[COPY_STYLE_DEFAULT];
  const layout = layoutCopy(
    section,
    (text, size, weight) => {
      ctx.font = `${weight} ${size}px ${FALLBACK_STACK}`;
      return ctx.measureText(text).width;
    },
    { padX: paint.padX, textWidth: paint.textWidth },
  );

  paint.plate?.(ctx, layout, section);

  ctx.textBaseline = "alphabetic";
  if (paint.shadow) {
    ctx.shadowColor = paint.shadow.color;
    ctx.shadowBlur = paint.shadow.blur;
    ctx.shadowOffsetY = paint.shadow.offsetY;
  }
  for (const line of layout.lines) {
    ctx.font = `${line.fontWeight} ${line.fontSize}px ${FALLBACK_STACK}`;
    if (line.kind === "bullet" && line.firstInBlock) {
      ctx.fillStyle = paint.bulletInk;
      ctx.fillText("\u2022", line.x - 36, line.y);
    }
    ctx.fillStyle = paint.ink;
    ctx.fillText(line.text, line.x, line.y);
  }
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function toJpeg(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new ComposeError("CANVAS_EXPORT_FAILED"))),
      "image/jpeg",
      0.9,
    ),
  );
}

/**
 * 원본 응답 JSON + 섹션 카피 → 완성 JPEG Blob.
 * image_model_text 모드는 모델이 글자를 그린 원본을 그대로 쓴다.
 */
export async function composeSection(
  rawText: string,
  section: Section,
  copyStyle: CopyStyle = COPY_STYLE_DEFAULT,
): Promise<Blob> {
  if (
    !sectionPlanSchema.safeParse(section).success ||
    !sectionCopySchema.safeParse(section).success
  ) {
    throw new ComposeError("COPY_INVALID");
  }
  const bytes = decodeRawResponse(rawText);
  const raw = new Blob([bytes.slice()], { type: "image/jpeg" });
  if (section.renderMode === "image_model_text") return raw;

  await ensureFont();
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(raw);
  } catch {
    throw new ComposeError("IMAGE_DECODE_FAILED");
  }
  try {
    const canvas = document.createElement("canvas");
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ComposeError("CANVAS_UNAVAILABLE");
    drawCover(ctx, bitmap);
    drawCopy(ctx, section, copyStyle);
    const blob = await toJpeg(canvas);
    if (blob.type !== "image/jpeg" || blob.size < 4) throw new ComposeError("CANVAS_EXPORT_FAILED");
    return blob;
  } finally {
    bitmap.close();
  }
}
