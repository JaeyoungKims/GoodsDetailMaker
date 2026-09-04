import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** 저장 키 규칙. DATA_DIR 아래 상대경로. 사용자·작업 단위 폴더라 삭제와 용량 집계가 쉽다. */
export const storageKeys = {
  input: (userId: string, jobId: string, inputId: string, contentType = "image/jpeg") =>
    `users/${userId}/jobs/${jobId}/inputs/${inputId}.${EXT[contentType] ?? "bin"}`,
  raw: (userId: string, jobId: string, sectionIndex: number) =>
    `users/${userId}/jobs/${jobId}/raw/${String(sectionIndex).padStart(2, "0")}.json`,
  thumbRaw: (userId: string, jobId: string, kind: string, optionIndex: number) =>
    `users/${userId}/jobs/${jobId}/thumbs/${kind}-${String(optionIndex).padStart(2, "0")}.json`,
  jobPrefix: (userId: string, jobId: string) => `users/${userId}/jobs/${jobId}`,
};

/** 로컬 디스크 저장소. 키가 DATA_DIR 밖으로 나가지 못하게 막는다. */
export class DiskStorage {
  constructor(private readonly root: string) {}

  private resolve(key: string): string {
    const full = normalize(join(this.root, key));
    const base = normalize(this.root + sep);
    if (!full.startsWith(base)) throw new Error("STORAGE_KEY_INVALID");
    return full;
  }

  async put(key: string, body: Uint8Array | string): Promise<void> {
    const path = this.resolve(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async size(key: string): Promise<number | null> {
    try {
      return (await stat(this.resolve(key))).size;
    } catch {
      return null;
    }
  }

  async deletePrefix(prefix: string): Promise<void> {
    await rm(this.resolve(prefix), { recursive: true, force: true });
  }
}
