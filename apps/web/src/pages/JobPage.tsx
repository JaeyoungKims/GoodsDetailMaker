import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import {
  SECTION_COUNT,
  STORY_STAGE_LABELS,
  type Section,
  type SectionCopyUpdate,
} from "@gdm/shared";
import { ExportPanel, type ExportKind } from "@/components/job/ExportPanel";
import { JobHero } from "@/components/job/JobHero";
import { SectionCard } from "@/components/job/SectionCard";
import { useAuth } from "@/features/auth/useAuth";
import { PreviewCache } from "@/features/compose/previewCache";
import { fileNames, triggerDownload } from "@/features/export/download";
import { useJobProgress } from "@/features/jobs/useJobProgress";
import { jobsApi } from "@/lib/api/jobs";
import "@/styles/job.css";

export function JobPage() {
  const { jobId } = useParams();
  if (!jobId) return <Navigate to="/" replace />;
  return <JobView jobId={jobId} />;
}

function JobView({ jobId }: { jobId: string }) {
  const { user, accessToken } = useAuth();
  const token = accessToken ?? "";
  const userId = user?.id ?? "";
  const { job, loading, error, realtimeDown, refresh, replaceSection } = useJobProgress({
    jobId,
    userId,
    accessToken: token,
  });

  const cache = useRef(new PreviewCache());
  const [, bump] = useState(0);
  const [notice, setNotice] = useState("");
  const [exportMessage, setExportMessage] = useState("");
  const [exporting, setExporting] = useState<ExportKind | null>(null);
  const exportAbort = useRef<AbortController | null>(null);

  if (job) cache.current.sync(jobId, job.sections);
  useEffect(() => {
    const current = cache.current;
    return () => {
      exportAbort.current?.abort();
      current.clear();
    };
  }, [jobId]);

  const onPreviewReady = useCallback(
    (index: number, copyVersion: number, blob: Blob) => {
      if (cache.current.put(jobId, index, copyVersion, blob)) bump((n) => n + 1);
    },
    [jobId],
  );

  const onRetry = useCallback(
    async (index: number): Promise<boolean> => {
      setNotice("");
      try {
        const result = await jobsApi.retry(token, jobId, index);
        const current = job?.sections.find((s) => s.index === index);
        if (current) replaceSection({ ...current, status: "queued", errorCode: null });
        setNotice(
          result.imageGenerationEnabled
            ? `${index}번 장을 다시 만들기 시작했어요.`
            : "다시 만들기 요청은 안전하게 저장했어요. 생성 기능이 켜지면 자동으로 이어집니다.",
        );
        return true;
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        setNotice(
          code === "JOB_EXPIRED"
            ? "보관 기간이 지나 이 작업은 다시 만들 수 없어요. 새 상세페이지를 시작해 주세요."
            : code === "SECTION_MANUAL_RETRY_LIMIT"
              ? "이 장은 다시 만들 수 있는 횟수를 모두 사용했어요."
              : "다시 만들기 요청을 저장하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
        );
        return false;
      }
    },
    [job, jobId, replaceSection, token],
  );

  const onCopySave = useCallback(
    async (index: number, copy: SectionCopyUpdate): Promise<Section> =>
      (await jobsApi.updateCopy(token, jobId, index, copy)).section,
    [jobId, token],
  );

  const onFeedbackSave = useCallback(
    async (index: number, feedback: string): Promise<Section> =>
      (await jobsApi.updateFeedback(token, jobId, index, feedback)).section,
    [jobId, token],
  );

  async function exportAll(kind: ExportKind) {
    if (!job || exporting) return;
    const blobs = cache.current.orderedCurrent(jobId, job.sections);
    if (!blobs) {
      setExportMessage(
        `현재 카피가 반영된 미리보기 ${job.sections.length}장을 먼저 준비해 주세요.`,
      );
      return;
    }
    const controller = new AbortController();
    exportAbort.current = controller;
    setExporting(kind);
    setExportMessage("");
    try {
      const file =
        kind === "zip"
          ? await (
              await import("@/features/export/exportZip")
            ).exportZip(blobs, { signal: controller.signal })
          : await (
              await import("@/features/export/exportVertical")
            ).exportVertical(blobs, { signal: controller.signal });
      // 내보내는 사이 카피가 바뀌었으면 옛 파일을 주지 않는다
      const latest = cache.current.orderedCurrent(jobId, job.sections);
      if (!latest || latest.some((b, i) => b !== blobs[i]))
        throw new Error("EXPORT_SNAPSHOT_STALE");
      triggerDownload(
        file,
        kind === "zip"
          ? fileNames.zip(job.productName, jobId, job.sections.length)
          : fileNames.vertical(job.productName, jobId),
      );
      setExportMessage(
        kind === "zip"
          ? `${job.sections.length}장 ZIP 다운로드를 시작했어요.`
          : "세로 합본 JPG 다운로드를 시작했어요.",
      );
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setExportMessage(
        err instanceof Error && err.message === "EXPORT_SNAPSHOT_STALE"
          ? "카피가 바뀌어 이전 파일은 내보내지 않았어요. 새 미리보기를 준비한 뒤 다시 눌러 주세요."
          : "파일을 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      );
    } finally {
      if (exportAbort.current === controller) exportAbort.current = null;
      setExporting(null);
    }
  }

  if (loading && !job) {
    return (
      <main className="job-page job-page--center">
        <p role="status">{SECTION_COUNT}장의 진행 상황을 불러오는 중…</p>
      </main>
    );
  }
  if (!job) {
    return (
      <main className="job-page job-page--center">
        <h1>진행 상황을 불러오지 못했어요</h1>
        <p>잠시 뒤 다시 확인해 주세요.</p>
        <button onClick={() => void refresh()}>다시 확인</button>
      </main>
    );
  }

  const total = job.sections.length || SECTION_COUNT;
  const completed = job.sections.filter((s) => s.status === "completed").length;
  const failed = job.sections.filter((s) => s.status === "failed").length;
  const exportReady = cache.current.orderedCurrent(jobId, job.sections) !== null;

  return (
    <main className="job-page">
      <a className="job-page__back" href="/">
        ← 새 상세페이지 또는 설정으로
      </a>
      <JobHero job={job} total={total} completed={completed} failed={failed} />

      {!job.imageGenerationEnabled && (
        <aside className="service-notice" role="status">
          <strong>생성 기능이 아직 켜지지 않았어요.</strong>
          <p>
            카피 편집은 바로 저장됩니다. 이미지 다시 만들기 요청은 안전하게 저장해 두었다가 기능이
            켜지면 이어서 처리합니다.
          </p>
        </aside>
      )}
      {(error || realtimeDown) && (
        <div className="progress-notice" role="status">
          실시간 연결이 잠시 불안정해 자동으로 다시 확인하고 있어요.
        </div>
      )}
      {notice && (
        <div className="progress-notice" role="status">
          {notice}
        </div>
      )}

      {job.sections.length > 0 && (
        <ExportPanel
          total={total}
          ready={exportReady}
          running={exporting}
          message={exportMessage}
          onExport={(k) => void exportAll(k)}
        />
      )}

      {job.sections.length === 0 && job.status === "failed" ? (
        <section className="planning-card planning-card--failed" role="alert">
          <strong>기획 단계에서 멈췄어요</strong>
          <p>
            {job.errorCode === "OPENAI_API_KEY_INVALID"
              ? "OpenAI API 키가 없거나 유효하지 않아요. 설정에서 키를 확인한 뒤 새 상세페이지를 시작해 주세요."
              : job.errorCode === "OPENAI_RATE_LIMIT"
                ? "OpenAI 요청 한도에 걸렸어요. 잠시 뒤 새 상세페이지를 시작해 주세요."
                : "AI 기획 요청이 실패했어요. 잠시 뒤 새 상세페이지를 다시 시작해 주세요."}
          </p>
          {job.errorCode && <small>{job.errorCode}</small>}
          <a className="btn-primary" href="/new">
            새 상세페이지 만들기
          </a>
        </section>
      ) : job.sections.length === 0 ? (
        <section className="planning-card" aria-live="polite">
          <span>1</span>
          <span>2</span>
          <span>3</span>
          <strong>{SECTION_COUNT}단계 전환 퍼널을 기획하고 있어요</strong>
          <p>선택한 설득 흐름대로 기획한 뒤, 각 이미지를 따로 생성합니다.</p>
        </section>
      ) : (
        <section className="job-results" aria-label={`상세페이지 결과 ${total}장`}>
          {job.sections.map((section) => {
            const stage = job.storyOrder[section.index - 1];
            return (
              <SectionCard
                key={section.index}
                section={section}
                jobId={jobId}
                accessToken={token}
                stageLabel={stage ? STORY_STAGE_LABELS[stage] : undefined}
                cachedBlob={cache.current.get(jobId, section.index, section.copyVersion)}
                downloadName={fileNames.section(job.productName, jobId, section.index)}
                onPreviewReady={onPreviewReady}
                onRetry={onRetry}
                onCopySave={onCopySave}
                onFeedbackSave={onFeedbackSave}
                onCopyApplied={replaceSection}
                onConflict={() => void refresh()}
              />
            );
          })}
        </section>
      )}
    </main>
  );
}
