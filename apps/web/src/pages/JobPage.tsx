import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router";
import type { Job } from "@gdm/shared";
import { useAccessToken } from "@/features/auth/useAuth";
import { jobsApi } from "@/lib/api/jobs";

/**
 * 진행/결과 화면 — 골격.
 * TODO(realtime): Supabase Realtime(job_sections) 구독 + 7초 폴링 백업 훅(features/jobs/useJobProgress).
 * TODO(compose): raw JSON → JPEG 검증 → Canvas 카피 오버레이(features/compose) → 미리보기·다운로드.
 * TODO(export): ZIP / 세로 합본(features/export, 지연 로드).
 */
export function JobPage() {
  const { jobId } = useParams();
  const token = useAccessToken();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;
    const controller = new AbortController();
    jobsApi
      .get(token, jobId, controller.signal)
      .then(setJob)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "JOB_REQUEST_FAILED"));
    return () => controller.abort();
  }, [jobId, token]);

  if (!jobId) return <Navigate to="/" replace />;
  if (error) return <main className="page-center">진행 상황을 불러오지 못했어요. ({error})</main>;
  if (!job) return <main className="page-center">13장의 진행 상황을 불러오는 중…</main>;

  const completed = job.sections.filter((s) => s.status === "completed").length;
  const failed = job.sections.filter((s) => s.status === "failed").length;

  return (
    <main className="job-page">
      <header className="job-hero">
        <p className="eyebrow">상세페이지 13장 제작실</p>
        <h1>{job.productName}</h1>
        <p role="status">
          완료 {completed} / 실패 {failed} / 진행 {job.sections.length - completed - failed}
        </p>
      </header>
      {job.sections.length === 0 ? (
        <section className="planning-card">13단계 전환 퍼널을 기획하고 있어요</section>
      ) : (
        <section className="job-results">
          {job.sections.map((section) => (
            <article
              key={section.index}
              className="section-card"
              data-testid={`section-${section.index}`}
            >
              <span className="section-card__number">{String(section.index).padStart(2, "0")}</span>
              <h2>{section.headline}</h2>
              <span className={`status status--${section.status}`}>{section.status}</span>
            </article>
          ))}
        </section>
      )}
    </main>
  );
}
