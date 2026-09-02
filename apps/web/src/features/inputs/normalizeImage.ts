import { INPUT_IMAGE_MAX_EDGE } from "@gdm/shared";

/** 정규화 전 원본이 이 크기를 넘으면 브라우저 메모리 보호를 위해 거부 */
const SOURCE_MAX_EDGE = 20_000;
/** 정규화 결과 JPEG 상한 */
const OUTPUT_MAX_BYTES = 10_000_000;

export class ImageNormalizationError extends Error {
  constructor() {
    super("IMAGE_NORMALIZATION_FAILED");
    this.name = "ImageNormalizationError";
  }
}

function toJpegBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new ImageNormalizationError())),
        "image/jpeg",
        0.92,
      );
    } catch {
      reject(new ImageNormalizationError());
    }
  });
}

function jpegName(name: string): string {
  return `${name.replace(/\.[^.]+$/u, "").trim() || "product"}.jpg`;
}

/**
 * 업로드 전 브라우저에서 입력 이미지를 안전한 형태로 바꾼다.
 * - EXIF 회전 반영, 최대 변 2048px, 흰 배경(투명 PNG 대비), JPEG 0.92
 * - 서버는 image/jpeg 만 받으므로 모든 형식이 여기서 JPEG 가 된다.
 */
export async function normalizeImage(file: File): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new ImageNormalizationError();
  }
  try {
    const { width, height } = bitmap;
    if (
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width < 1 ||
      height < 1 ||
      width > SOURCE_MAX_EDGE ||
      height > SOURCE_MAX_EDGE
    ) {
      throw new ImageNormalizationError();
    }
    const scale = Math.min(1, INPUT_IMAGE_MAX_EDGE / Math.max(width, height));
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new ImageNormalizationError();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetWidth, targetHeight);
    ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);

    const blob = await toJpegBlob(canvas);
    if (blob.type !== "image/jpeg" || blob.size < 1 || blob.size > OUTPUT_MAX_BYTES) {
      throw new ImageNormalizationError();
    }
    return new File([blob], jpegName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified,
    });
  } catch (err) {
    throw err instanceof ImageNormalizationError ? err : new ImageNormalizationError();
  } finally {
    bitmap.close();
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}
