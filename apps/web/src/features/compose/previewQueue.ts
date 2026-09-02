/** 미리보기 합성 동시 실행 수 제한 (기본 2). 취소된 작업은 시작하지 않는다. */
export function createPreviewQueue(limit = 2) {
  let running = 0;
  interface Item {
    task: () => Promise<Blob>;
    resolve: (b: Blob) => void;
    reject: (e: Error) => void;
    signal: AbortSignal | undefined;
  }
  const pending: Item[] = [];

  const pump = () => {
    while (running < limit && pending.length) {
      const item = pending.shift()!;
      if (item.signal?.aborted) {
        item.reject(new Error("PREVIEW_ABORTED"));
        continue;
      }
      running += 1;
      item
        .task()
        .then(item.resolve, item.reject)
        .finally(() => {
          running -= 1;
          pump();
        });
    }
  };

  return {
    run(task: () => Promise<Blob>, signal?: AbortSignal): Promise<Blob> {
      return new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error("PREVIEW_ABORTED"));
        const item: Item = { task, resolve, reject, signal };
        signal?.addEventListener(
          "abort",
          () => {
            const i = pending.indexOf(item);
            if (i >= 0) {
              pending.splice(i, 1);
              reject(new Error("PREVIEW_ABORTED"));
            }
          },
          { once: true },
        );
        pending.push(item);
        pump();
      });
    },
  };
}

export const previewQueue = createPreviewQueue(2);
