import { sectionCopySchema, sectionPlanSchema, type Section } from "@gdm/shared";
import { CANVAS_HEIGHT, CANVAS_WIDTH, layoutCopy } from "./layout";
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

function drawCopy(ctx: CanvasRenderingContext2D, section: Section) {
  const layout = layoutCopy(section, (text, size, weight) => {
    ctx.font = `${weight} ${size}px ${FALLBACK_STACK}`;
    return ctx.measureText(text).width;
  });
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

  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  for (const line of layout.lines) {
    ctx.font = `${line.fontWeight} ${line.fontSize}px ${FALLBACK_STACK}`;
    if (line.kind === "bullet" && line.firstInBlock) ctx.fillText("•", line.x - 36, line.y);
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
export async function composeSection(rawText: string, section: Section): Promise<Blob> {
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
    drawCopy(ctx, section);
    const blob = await toJpeg(canvas);
    if (blob.type !== "image/jpeg" || blob.size < 4) throw new ComposeError("CANVAS_EXPORT_FAILED");
    return blob;
  } finally {
    bitmap.close();
  }
}
