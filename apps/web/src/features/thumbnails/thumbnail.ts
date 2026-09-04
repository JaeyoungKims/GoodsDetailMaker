// 정사각 썸네일: 1024 원본 디코드 → 1000×1000 축소, 옵션 여러 장을 격자로 합성
import { THUMB_EXPORT_SIZE, THUMB_SOURCE_SIZE, type Thumbnail } from "@gdm/shared";
import { decodeRawResponse } from "@/features/compose/rawResponse";

/** 원본 응답 JSON → 1024×1024 JPEG 바이트 */
export function decodeThumbnailResponse(text: string): Uint8Array {
  return decodeRawResponse(text, THUMB_SOURCE_SIZE, THUMB_SOURCE_SIZE);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("CANVAS_EXPORT_FAILED"))),
      "image/jpeg",
      0.92,
    ),
  );
}

/** 1024 원본을 마켓 규격 1000×1000 으로 줄인다 */
export async function toExportThumbnail(bytes: Uint8Array): Promise<Blob> {
  const source = new Blob([bytes as unknown as BlobPart], { type: "image/jpeg" });
  const bitmap = await createImageBitmap(source);
  try {
    const canvas = document.createElement("canvas");
    canvas.width = THUMB_EXPORT_SIZE;
    canvas.height = THUMB_EXPORT_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bitmap, 0, 0, THUMB_EXPORT_SIZE, THUMB_EXPORT_SIZE);
    return await toBlob(canvas);
  } finally {
    bitmap.close();
  }
}

/**
 * 옵션 수에 맞는 격자 칸 수. 빈칸이 남지 않는 배열을 고른다.
 * 2개를 2×2 로 잡으면 아래 절반이 통째로 비어 썸네일이 허전해진다.
 */
export function gridSize(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  if (count <= 6) return { cols: 3, rows: 2 };
  return { cols: 3, rows: 3 };
}

/**
 * 메인 썸네일 기본안: 옵션 썸네일을 격자로 붙인다.
 * 사용료가 들지 않고 실제 옵션과 정확히 일치한다.
 */
export async function composeGridThumbnail(blobs: Blob[]): Promise<Blob> {
  if (blobs.length === 0) throw new Error("THUMBNAIL_GRID_EMPTY");
  const { cols, rows } = gridSize(blobs.length);
  const canvas = document.createElement("canvas");
  canvas.width = THUMB_EXPORT_SIZE;
  canvas.height = THUMB_EXPORT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";

  const gap = 8;
  const cellW = (THUMB_EXPORT_SIZE - gap * (cols + 1)) / cols;
  const cellH = (THUMB_EXPORT_SIZE - gap * (rows + 1)) / rows;

  for (let i = 0; i < blobs.length && i < cols * rows; i += 1) {
    const bitmap = await createImageBitmap(blobs[i]!);
    try {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // 마지막 줄이 덜 찼으면 가운데로 모아 빈칸이 한쪽에 몰리지 않게 한다
      const inRow = Math.min(cols, blobs.length - row * cols);
      const offset = ((cols - inRow) * (cellW + gap)) / 2;
      const x = gap + offset + col * (cellW + gap);
      const y = gap + row * (cellH + gap);
      const side = Math.min(cellW, cellH);
      ctx.drawImage(bitmap, x + (cellW - side) / 2, y + (cellH - side) / 2, side, side);
    } finally {
      bitmap.close();
    }
  }
  return toBlob(canvas);
}

/** 파일명: thumb-main.jpg / thumb-01-옵션명.jpg */
export function thumbnailFileName(thumb: Pick<Thumbnail, "kind" | "optionIndex" | "name">): string {
  if (thumb.kind === "main") return "thumb-main.jpg";
  const slug =
    thumb.name
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 24) || "option";
  return `thumb-${String(thumb.optionIndex).padStart(2, "0")}-${slug}.jpg`;
}
