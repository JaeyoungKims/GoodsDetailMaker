import type { SectionRole } from "@gdm/shared";

const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_BYTES = 156 * 1024 * 1024;

/** role 은 그 자리의 설득 단계가 정하므로 index 만으로는 알 수 없다 */
export function sectionFileName(index: number, role: SectionRole): string {
  return `${String(index).padStart(2, "0")}-${role.toLowerCase()}.jpg`;
}

export function jobFilePrefix(productName: string, jobId: string): string {
  const slug =
    productName
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "detail-page";
  const suffix = jobId.replace(/[^a-zA-Z0-9]/g, "").slice(-8) || "job";
  return `${slug}-${suffix}`;
}

export const fileNames = {
  section: (productName: string, jobId: string, index: number, role: SectionRole) =>
    `${jobFilePrefix(productName, jobId)}-${sectionFileName(index, role)}`,
  zip: (productName: string, jobId: string, count: number) =>
    `${jobFilePrefix(productName, jobId)}-${count}장.zip`,
  vertical: (productName: string, jobId: string) =>
    `${jobFilePrefix(productName, jobId)}-세로합본.jpg`,
};

async function readBytes(blob: Blob): Promise<Uint8Array> {
  return new Uint8Array(await blob.arrayBuffer());
}

/** 내보내기 전 JPEG 시그니처(FFD8FF … FFD9)와 크기를 확인한다 */
export async function assertExportableJpeg(blob: Blob, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new DOMException("EXPORT_ABORTED", "AbortError");
  if (!(blob instanceof Blob) || blob.type.toLowerCase() !== "image/jpeg")
    throw new Error("EXPORT_IMAGE_TYPE_INVALID");
  if (blob.size < 5) throw new Error("EXPORT_IMAGE_SIGNATURE_INVALID");
  if (blob.size > MAX_IMAGE_BYTES) throw new Error("EXPORT_IMAGE_TOO_LARGE");
  const [head, tail] = await Promise.all([
    readBytes(blob.slice(0, 3)),
    readBytes(blob.slice(blob.size - 2)),
  ]);
  if (
    head[0] !== 0xff ||
    head[1] !== 0xd8 ||
    head[2] !== 0xff ||
    tail[0] !== 0xff ||
    tail[1] !== 0xd9
  ) {
    throw new Error("EXPORT_IMAGE_SIGNATURE_INVALID");
  }
}

export async function assertExportableSet(blobs: Blob[], signal?: AbortSignal): Promise<void> {
  if (blobs.reduce((sum, b) => sum + b.size, 0) > MAX_TOTAL_BYTES)
    throw new Error("EXPORT_IMAGES_TOO_LARGE");
  for (const blob of blobs) await assertExportableJpeg(blob, signal);
}

/** 브라우저 다운로드 트리거. 파일명에 경로 문자가 섞이지 않게 막는다. */
export function triggerDownload(blob: Blob, fileName: string): void {
  if (!fileName || /[\\/]/.test(fileName) || [...fileName].some((c) => c.charCodeAt(0) < 32)) {
    throw new Error("DOWNLOAD_FILENAME_INVALID");
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }
}
