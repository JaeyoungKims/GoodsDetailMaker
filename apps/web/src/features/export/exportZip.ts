import JSZip from "jszip";
import type { SectionRole } from "@gdm/shared";
import { sectionFileName, assertExportableSet } from "./download";

/**
 * 완성 JPEG 를 ZIP 하나로 묶는다 (지연 로드 청크). roles 는 blobs 와 같은 순서.
 * extras 는 본문이 아닌 파일(마켓 썸네일)로, 규격이 달라 JPEG 검증에서 제외한다.
 */
export async function exportZip(
  blobs: Blob[],
  roles: readonly SectionRole[],
  extras: ReadonlyArray<{ name: string; blob: Blob }> = [],
  options: { signal?: AbortSignal } = {},
): Promise<Blob> {
  await assertExportableSet(blobs, options.signal);
  const zip = new JSZip();
  blobs.forEach((blob, i) => zip.file(sectionFileName(i + 1, roles[i]!), blob));
  extras.forEach((extra) => zip.file(extra.name, extra.blob));
  const out = await zip.generateAsync({ type: "blob", compression: "STORE" });
  if (options.signal?.aborted) throw new DOMException("EXPORT_ABORTED", "AbortError");
  return out;
}
