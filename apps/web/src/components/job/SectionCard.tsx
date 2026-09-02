import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  SECTION_ROLE_LABELS,
  sectionCopySchema,
  sectionErrorMessage,
  type Section,
  type SectionCopy,
  type SectionCopyUpdate,
} from "@gdm/shared";
import { composeSection } from "@/features/compose/compose";
import { previewQueue } from "@/features/compose/previewQueue";
import { assertExportableJpeg, triggerDownload } from "@/features/export/download";
import { CopyVersionConflictError } from "@/lib/api/http";
import { jobsApi } from "@/lib/api/jobs";

const STATUS_LABEL: Record<Section["status"], string> = {
  queued: "대기 중",
  waiting_rate_limit: "잠시 쉬는 중",
  generating: "만드는 중",
  completed: "완료",
  failed: "실패",
};

interface Props {
  section: Section;
  jobId: string;
  accessToken: string;
  stageLabel?: string | undefined;
  cachedBlob: Blob | null;
  downloadName: string;
  onPreviewReady: (index: number, copyVersion: number, blob: Blob) => void;
  onRetry: (index: number) => Promise<boolean>;
  onCopySave: (index: number, copy: SectionCopyUpdate) => Promise<Section>;
  onCopyApplied: (section: Section) => void;
  onConflict: () => void;
}

const draftOf = (s: Section): SectionCopy => ({
  headline: s.headline,
  subheadline: s.subheadline,
  bullets: s.bullets,
});
const sameCopy = (a: SectionCopy, b: SectionCopy) =>
  a.headline === b.headline &&
  a.subheadline === b.subheadline &&
  a.bullets.length === b.bullets.length &&
  a.bullets.every((v, i) => v === b.bullets[i]);

export function SectionCard({
  section,
  jobId,
  accessToken,
  stageLabel,
  cachedBlob,
  downloadName,
  onPreviewReady,
  onRetry,
  onCopySave,
  onCopyApplied,
  onConflict,
}: Props) {
  const identity = `${jobId}:${section.index}:${section.copyVersion}`;
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [reloadTick, setReloadTick] = useState(0);
  const [draft, setDraft] = useState<SectionCopy>(() => draftOf(section));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [message, setMessage] = useState("");
  const [downloadMessage, setDownloadMessage] = useState("");
  const savedVersion = useRef(section.copyVersion);

  // 서버 카피가 바뀌면 초안을 맞춘다. 내가 편집 중이면 덮어쓰지 않고 알린다.
  useEffect(() => {
    if (section.copyVersion === savedVersion.current) return;
    savedVersion.current = section.copyVersion;
    if (dirty && !sameCopy(draft, draftOf(section))) {
      setMessage("다른 곳에서 카피가 수정됐어요. 현재 입력은 유지했습니다.");
      return;
    }
    setDraft(draftOf(section));
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.copyVersion]);

  // 완료된 장은 원본을 받아 합성한다 (캐시 우선)
  useEffect(() => {
    if (section.status !== "completed") {
      setPreviewUrl(null);
      setPreviewBlob(null);
      setPreviewFailed(false);
      return;
    }
    const controller = new AbortController();
    let url: string | undefined;
    setPreviewFailed(false);

    const ready = (blob: Blob, fromCache: boolean) => {
      url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      if (!fromCache) onPreviewReady(section.index, section.copyVersion, blob);
    };

    if (cachedBlob) {
      ready(cachedBlob, true);
    } else {
      setPreviewUrl(null);
      setPreviewBlob(null);
      previewQueue
        .run(async () => {
          const raw = await jobsApi.raw(accessToken, jobId, section.index, controller.signal);
          if (controller.signal.aborted) throw new Error("PREVIEW_ABORTED");
          return composeSection(raw, section);
        }, controller.signal)
        .then((blob) => !controller.signal.aborted && ready(blob, false))
        .catch(() => !controller.signal.aborted && setPreviewFailed(true));
    }
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, section.status, cachedBlob, reloadTick]);

  async function retry() {
    if (retrying) return;
    setRetrying(true);
    try {
      await onRetry(section.index);
    } finally {
      setRetrying(false);
    }
  }

  async function saveCopy(
    successMessage = "카피를 저장했어요. 이미지 비용은 들지 않았습니다.",
  ): Promise<Section | null> {
    const valid = sectionCopySchema.safeParse({
      ...draft,
      bullets: draft.bullets.filter((b) => b.trim()),
    });
    if (!valid.success) {
      setMessage("카피 길이와 내용을 확인해 주세요. (제목 28자, 보조 52자, 핵심 문구 3개·각 30자)");
      return null;
    }
    setSaving(true);
    setMessage("");
    try {
      const updated = await onCopySave(section.index, {
        ...valid.data,
        expectedCopyVersion: section.copyVersion,
      });
      savedVersion.current = updated.copyVersion;
      setDraft(draftOf(updated));
      setDirty(false);
      onCopyApplied(updated);
      if (successMessage) setMessage(successMessage);
      return updated;
    } catch (err) {
      if (err instanceof CopyVersionConflictError) {
        setMessage("다른 곳에서 카피가 수정됐어요. 최신 내용을 불러옵니다.");
        onConflict();
      } else {
        setMessage("카피를 저장하지 못했어요. 다시 시도해 주세요.");
      }
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function regenerate() {
    const ok = window.confirm(
      "수정한 문구를 반영해 이 이미지만 다시 만들까요?\nOpenAI 이미지 API 사용료가 한 번 더 발생합니다.",
    );
    if (!ok || retrying || saving) return;
    if (dirty) {
      const saved = await saveCopy("");
      if (!saved) return;
    }
    setRetrying(true);
    try {
      const started = await onRetry(section.index);
      setMessage(
        started
          ? "수정한 문구를 반영해 이 이미지를 다시 만들기 시작했어요."
          : "문구는 저장했지만 이미지 다시 만들기를 시작하지 못했어요. 다시 눌러 주세요.",
      );
    } finally {
      setRetrying(false);
    }
  }

  async function download() {
    if (!previewBlob) return;
    setDownloadMessage("");
    try {
      await assertExportableJpeg(previewBlob);
      triggerDownload(previewBlob, downloadName);
      setDownloadMessage("JPG 다운로드를 시작했어요.");
    } catch {
      setDownloadMessage("JPG 다운로드를 시작하지 못했어요. 다시 시도해 주세요.");
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (section.renderMode === "browser_overlay") void saveCopy();
  }

  const label = stageLabel ?? SECTION_ROLE_LABELS[section.role];
  const reviewDraftNotice =
    section.renderMode === "image_model_text" &&
    label.includes("후기") &&
    (draft.headline.includes("편집용 후기 초안") ||
      draft.bullets.some((b) => b.includes("가상 고객")));

  return (
    <article
      className="section-card"
      data-testid={`section-${section.index}`}
      aria-labelledby={`section-${section.index}-title`}
    >
      <div className="section-card__heading">
        <span className="section-card__number">{String(section.index).padStart(2, "0")}</span>
        <div>
          <p>{label}</p>
          <h2 id={`section-${section.index}-title`}>{section.headline}</h2>
        </div>
        <span className={`status status--${section.status}`}>{STATUS_LABEL[section.status]}</span>
      </div>

      <div className="section-card__body">
        <div className="section-preview" aria-label={`${section.index}번 이미지 미리보기`}>
          {previewUrl ? (
            <div className="section-preview__result">
              <img src={previewUrl} alt={`${section.index}번 ${label} 결과`} />
              <button type="button" onClick={() => void download()}>
                JPG 다운로드
              </button>
              {downloadMessage && <p role="status">{downloadMessage}</p>}
            </div>
          ) : section.status === "completed" && !previewFailed ? (
            <p role="status">미리보기를 준비하는 중…</p>
          ) : previewFailed ? (
            <div>
              <p>미리보기를 불러오지 못했어요.</p>
              <button type="button" onClick={() => setReloadTick((t) => t + 1)}>
                미리보기 다시 불러오기
              </button>
            </div>
          ) : (
            <div className="section-preview__placeholder">
              <strong>{STATUS_LABEL[section.status]}</strong>
              <p>{section.subheadline || "이미지가 준비되면 이곳에서 확인할 수 있어요."}</p>
            </div>
          )}
        </div>

        <div className="section-editor">
          {section.status === "failed" && (
            <div className="section-error" role="status">
              <p>{sectionErrorMessage(section.errorCode)}</p>
              <button type="button" disabled={retrying} onClick={() => void retry()}>
                {retrying ? "다시 만드는 중…" : "이 장만 다시 만들기"}
              </button>
            </div>
          )}
          {reviewDraftNotice && (
            <aside className="section-draft-notice" role="note">
              <strong>가상 고객 이름과 후기 문구는 편집용 초안입니다.</strong>
              <p>실제 후기나 원하는 문구로 바꾼 뒤 이미지를 다시 만들어 주세요.</p>
            </aside>
          )}
          <form onSubmit={onSubmit}>
            <label>
              큰 제목
              <input
                name="headline"
                maxLength={28}
                value={draft.headline}
                onChange={(e) => {
                  setDirty(true);
                  setDraft((d) => ({ ...d, headline: e.target.value }));
                }}
              />
            </label>
            <label>
              보조 문구
              <input
                name="subheadline"
                maxLength={52}
                value={draft.subheadline}
                onChange={(e) => {
                  setDirty(true);
                  setDraft((d) => ({ ...d, subheadline: e.target.value }));
                }}
              />
            </label>
            <label>
              핵심 문구 (줄마다 하나)
              <textarea
                name="bullets"
                value={draft.bullets.join("\n")}
                onChange={(e) => {
                  setDirty(true);
                  setDraft((d) => ({ ...d, bullets: e.target.value.split("\n") }));
                }}
              />
            </label>
            {section.renderMode === "browser_overlay" ? (
              <button type="submit" disabled={saving || retrying || !dirty}>
                {saving ? "저장 중…" : "카피 저장"}
              </button>
            ) : (
              <p className="section-editor__embedded-hint">
                수정한 문구를 이미지에 반영하려면 아래 다시 만들기 버튼을 눌러 주세요.
              </p>
            )}
          </form>
          {message && <p role="status">{message}</p>}
          {section.status === "completed" && (
            <div className="section-regenerate">
              <div>
                <strong>문구를 고치거나 다른 결과가 필요하신가요?</strong>
                <p>위 문구와 현재 기획을 반영해 이 한 장만 새 이미지로 다시 만듭니다.</p>
              </div>
              <button type="button" disabled={retrying || saving} onClick={() => void regenerate()}>
                {retrying ? "다시 만드는 중…" : "수정 문구로 이 이미지 다시 만들기"}
              </button>
              <small>다시 만들 때 OpenAI 이미지 API 사용료가 추가됩니다.</small>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
