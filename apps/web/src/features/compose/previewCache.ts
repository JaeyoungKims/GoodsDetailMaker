import type { Section } from "@gdm/shared";

/**
 * 합성된 미리보기 Blob 캐시. (jobId, index, copyVersion) 이 모두 맞을 때만 유효하다.
 * 카피가 바뀌면 해당 장은 자동으로 버려진다.
 */
export class PreviewCache {
  private jobId: string | null = null;
  private versions = new Map<number, number>();
  private blobs = new Map<number, { copyVersion: number; blob: Blob }>();

  sync(jobId: string, sections: Section[]) {
    if (jobId !== this.jobId) {
      this.clear();
      this.jobId = jobId;
    }
    const next = new Map<number, number>();
    for (const s of sections) if (s.status === "completed") next.set(s.index, s.copyVersion);
    this.versions = next;
    for (const [index, entry] of this.blobs) {
      if (next.get(index) !== entry.copyVersion) this.blobs.delete(index);
    }
  }

  put(jobId: string, index: number, copyVersion: number, blob: Blob): boolean {
    if (
      jobId !== this.jobId ||
      this.versions.get(index) !== copyVersion ||
      blob.type !== "image/jpeg"
    )
      return false;
    this.blobs.set(index, { copyVersion, blob });
    return true;
  }

  get(jobId: string, index: number, copyVersion: number): Blob | null {
    if (jobId !== this.jobId || this.versions.get(index) !== copyVersion) return null;
    const entry = this.blobs.get(index);
    return entry?.copyVersion === copyVersion ? entry.blob : null;
  }

  /** 모든 장이 완료됐고 현재 카피 버전의 Blob 이 전부 있으면 순서대로 돌려준다 */
  orderedCurrent(jobId: string, sections: Section[]): Blob[] | null {
    if (jobId !== this.jobId || sections.length === 0) return null;
    const ordered = [...sections].sort((a, b) => a.index - b.index);
    if (ordered.some((s, i) => s.index !== i + 1 || s.status !== "completed")) return null;
    const blobs = ordered.map((s) => this.get(jobId, s.index, s.copyVersion));
    return blobs.every((b): b is Blob => b !== null) ? blobs : null;
  }

  clear() {
    this.blobs.clear();
    this.versions.clear();
    this.jobId = null;
  }
}
