import JSZip from "jszip";
import { sectionFileName, assertExportableSet } from "./download";

/** 완성 JPEG 13장을 ZIP 하나로 묶는다 (지연 로드 청크) */
export async function exportZip(
  blobs: Blob[],
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  await assertExportableSet(blobs, options.signal);
  const zip = new JSZip();
  blobs.forEach((blob, i) => zip.file(sectionFileName(i + 1), blob));
  const out = await zip.generateAsync({ type: "blob", compression: "STORE" });
  if (options.signal?.aborted) throw new DOMException("EXPORT_ABORTED", "AbortError");
  return out;
}
