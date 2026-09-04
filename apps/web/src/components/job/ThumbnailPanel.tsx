// 진행 화면의 썸네일 구역: 옵션별 정사각 썸네일 + 메인(격자 합성 기본, AI 배치 선택)
import { useCallback, useEffect, useRef, useState } from "react";
import {
  THUMB_EXPORT_SIZE,
  sectionErrorMessage,
  type Thumbnail,
  type ThumbnailKind,
} from "@gdm/shared";
import { jobFilePrefix, triggerDownload } from "@/features/export/download";
import {
  composeGridThumbnail,
  decodeThumbnailResponse,
  thumbnailFileName,
  toExportThumbnail,
} from "@/features/thumbnails/thumbnail";
import { jobsApi } from "@/lib/api/jobs";

interface Props {
  jobId: string;
  accessToken: string;
  productName: string;
  thumbnails: Thumbnail[];
  onRequestMain: () => void;
  onRetry: (kind: ThumbnailKind, optionIndex: number) => void;
  /** ZIP 에 함께 담을 수 있도록 준비된 썸네일을 알린다 */
  onFilesReady?: (files: Array<{ name: string; blob: Blob }>) => void;
}

interface Preview {
  blob: Blob;
  url: string;
}

const keyOf = (kind: string, index: number) => `${kind}:${index}`;
const MAIN_KEY = keyOf("main", 0);

const STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  waiting_rate_limit: "잠시 대기",
  generating: "만드는 중",
  completed: "완료",
  failed: "실패",
};

export function ThumbnailPanel({
  jobId,
  accessToken,
  productName,
  thumbnails,
  onRequestMain,
  onRetry,
  onFilesReady,
}: Props) {
  const [previews, setPreviews] = useState<Map<string, Preview>>(new Map());
  const [grid, setGrid] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const loading = useRef(new Set<string>());
  /**
   * object URL 은 컴포넌트가 사라질 때 한 번에 되돌린다.
   * 상태가 바뀔 때마다 되돌리면 아직 화면에 붙어 있는 이미지가 깨진다.
   */
  const urls = useRef<string[]>([]);
  const mounted = useRef(true);

  useEffect(
    () => () => {
      mounted.current = false;
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    },
    [],
  );

  const trackUrl = (blob: Blob): string => {
    const url = URL.createObjectURL(blob);
    urls.current.push(url);
    return url;
  };

  const options = thumbnails.filter((t) => t.kind === "option");
  const aiMain = thumbnails.find((t) => t.kind === "main") ?? null;
  const prefix = jobFilePrefix(productName, jobId);
  const optionKey = options.map((o) => o.optionIndex).join(",");

  // 완료된 썸네일 원본을 받아 1000×1000 으로 줄여 둔다.
  // 한 번 시작한 것은 loading 에 남겨 두 번 받지 않는다.
  useEffect(() => {
    for (const thumb of thumbnails) {
      const key = keyOf(thumb.kind, thumb.optionIndex);
      if (thumb.status !== "completed" || loading.current.has(key)) continue;
      loading.current.add(key);
      void (async () => {
        try {
          const text = await jobsApi.thumbnailRaw(
            accessToken,
            jobId,
            thumb.kind,
            thumb.optionIndex,
          );
          const blob = await toExportThumbnail(decodeThumbnailResponse(text));
          if (!mounted.current) return;
          setPreviews((prev) => {
            if (prev.has(key)) return prev;
            return new Map(prev).set(key, { blob, url: trackUrl(blob) });
          });
        } catch {
          loading.current.delete(key);
          if (mounted.current) setMessage("썸네일 미리보기를 준비하지 못한 게 있어요.");
        }
      })();
    }
  }, [thumbnails, accessToken, jobId]);

  // 옵션 썸네일이 모두 준비되면 격자 메인을 만든다 (사용료 없음)
  useEffect(() => {
    const blobs = options.map((o) => previews.get(keyOf(o.kind, o.optionIndex))?.blob);
    if (blobs.length === 0 || blobs.some((b) => !b)) {
      setGrid(null);
      return;
    }
    void composeGridThumbnail(blobs as Blob[])
      .then((blob) => {
        if (!mounted.current) return;
        setGrid({ blob, url: trackUrl(blob) });
      })
      .catch(() => {
        if (mounted.current) setMessage("메인 썸네일을 합성하지 못했어요.");
      });
    // options 는 매 렌더 새 배열이라 인덱스 조합으로 비교한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previews, optionKey]);

  // 준비된 썸네일을 ZIP 용으로 올려 보낸다
  useEffect(() => {
    if (!onFilesReady) return;
    const files: Array<{ name: string; blob: Blob }> = [];
    if (grid) files.push({ name: "thumb-main.jpg", blob: grid.blob });
    for (const thumb of thumbnails) {
      const preview = previews.get(keyOf(thumb.kind, thumb.optionIndex));
      if (!preview) continue;
      files.push({
        name: thumb.kind === "main" ? "thumb-main-ai.jpg" : thumbnailFileName(thumb),
        blob: preview.blob,
      });
    }
    onFilesReady(files);
  }, [grid, previews, thumbnails, onFilesReady]);

  const download = useCallback(
    (blob: Blob, name: string) => {
      try {
        triggerDownload(blob, `${prefix}-${name}`);
      } catch {
        setMessage("파일을 내려받지 못했어요.");
      }
    },
    [prefix],
  );

  if (thumbnails.length === 0) return null;
  const mainPreview = previews.get(MAIN_KEY) ?? null;

  return (
    <section className="thumb-panel" aria-labelledby="thumb-title">
      <div className="thumb-panel__head">
        <div>
          <p className="eyebrow">마켓 썸네일</p>
          <h2 id="thumb-title">
            옵션 {options.length}개 · {THUMB_EXPORT_SIZE}×{THUMB_EXPORT_SIZE}
          </h2>
        </div>
        <small>목록 노출용 정사각 이미지예요. 문구는 넣지 않습니다.</small>
      </div>

      <div className="thumb-grid">
        <article className="thumb-card thumb-card--main">
          <header>
            <strong>메인 썸네일</strong>
            <span>{grid ? "옵션 모아보기" : "옵션 준비 중"}</span>
          </header>
          {grid ? (
            <img src={grid.url} alt="옵션을 모은 메인 썸네일" />
          ) : (
            <div className="thumb-empty">옵션 썸네일이 모두 완성되면 자동으로 만들어져요</div>
          )}
          <footer>
            <button
              type="button"
              disabled={!grid}
              onClick={() => grid && download(grid.blob, "thumb-main.jpg")}
            >
              내려받기
            </button>
            <button type="button" onClick={onRequestMain}>
              AI로 한 장면 만들기
            </button>
          </footer>
        </article>

        {aiMain && (
          <article className="thumb-card">
            <header>
              <strong>메인 (AI 배치)</strong>
              <span>{STATUS_LABEL[aiMain.status] ?? aiMain.status}</span>
            </header>
            {mainPreview ? (
              <img src={mainPreview.url} alt="AI가 배치한 메인 썸네일" />
            ) : (
              <div className="thumb-empty">
                {aiMain.status === "failed"
                  ? sectionErrorMessage(aiMain.errorCode)
                  : "만드는 중이에요"}
              </div>
            )}
            <footer>
              <button
                type="button"
                disabled={!mainPreview}
                onClick={() => mainPreview && download(mainPreview.blob, "thumb-main-ai.jpg")}
              >
                내려받기
              </button>
              {aiMain.status === "failed" && (
                <button type="button" onClick={() => onRetry("main", 0)}>
                  다시 시도
                </button>
              )}
            </footer>
          </article>
        )}

        {options.map((thumb) => {
          const key = keyOf(thumb.kind, thumb.optionIndex);
          const preview = previews.get(key);
          return (
            <article className="thumb-card" key={key}>
              <header>
                <strong>{thumb.name || `옵션 ${thumb.optionIndex}`}</strong>
                <span>{STATUS_LABEL[thumb.status] ?? thumb.status}</span>
              </header>
              {preview ? (
                <img src={preview.url} alt={`${thumb.name} 썸네일`} />
              ) : (
                <div className="thumb-empty">
                  {thumb.status === "failed"
                    ? sectionErrorMessage(thumb.errorCode)
                    : "만드는 중이에요"}
                </div>
              )}
              <footer>
                <button
                  type="button"
                  disabled={!preview}
                  onClick={() => preview && download(preview.blob, thumbnailFileName(thumb))}
                >
                  내려받기
                </button>
                {thumb.status === "failed" && (
                  <button type="button" onClick={() => onRetry(thumb.kind, thumb.optionIndex)}>
                    다시 시도
                  </button>
                )}
              </footer>
            </article>
          );
        })}
      </div>

      {message && (
        <p className="thumb-panel__status" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
