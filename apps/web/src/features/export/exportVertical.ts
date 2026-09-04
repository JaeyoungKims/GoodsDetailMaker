import { IMAGE_HEIGHT, IMAGE_WIDTH } from "@gdm/shared";
import { assertExportableSet } from "./download";

/** 만든 장을 세로로 이어 붙인 합본 JPEG (1024 × 1536·N). 스마트스토어형 긴 상세페이지용. */
export async function exportVertical(
  blobs: Blob[],
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  await assertExportableSet(blobs, options.signal);
  const canvas = document.createElement("canvas");
  canvas.width = IMAGE_WIDTH;
  canvas.height = IMAGE_HEIGHT * blobs.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < blobs.length; i += 1) {
    if (options.signal?.aborted) throw new DOMException("EXPORT_ABORTED", "AbortError");
    const bitmap = await createImageBitmap(blobs[i]!);
    try {
      ctx.drawImage(bitmap, 0, i * IMAGE_HEIGHT, IMAGE_WIDTH, IMAGE_HEIGHT);
    } finally {
      bitmap.close();
    }
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("CANVAS_EXPORT_FAILED"))),
      "image/jpeg",
      0.9,
    ),
  );
}
