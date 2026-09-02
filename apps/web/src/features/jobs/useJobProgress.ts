import { useCallback, useEffect, useRef, useState } from "react";
import { deriveJobStatus, sectionRealtimeRowSchema, type Job, type Section } from "@gdm/shared";
import { jobsApi } from "@/lib/api/jobs";
import { supabase } from "@/lib/supabase";

const TERMINAL = new Set<Job["status"]>(["completed", "failed", "partial"]);

interface Options {
  jobId: string;
  userId: string;
  accessToken: string;
  /** 폴링 간격(ms). 실시간이 끊기거나 진행 중일 때만 돈다. */
  pollIntervalMs?: number;
  requestTimeoutMs?: number;
}

/**
 * 작업 진행 상태 구독.
 * - Supabase Realtime(job_sections, job_id 필터)으로 변화를 감지하면 GET /api/jobs/:id 를 다시 읽는다.
 * - 실시간이 실패하거나 작업이 진행 중이면 폴링으로 보완한다.
 * - 동시 갱신 요청은 하나로 합치고, 진행 중에 또 요청이 오면 끝난 뒤 한 번 더 읽는다.
 */
export function useJobProgress({
  jobId,
  userId,
  accessToken,
  pollIntervalMs = 7000,
  requestTimeoutMs = 15000,
}: Options) {
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [realtimeDown, setRealtimeDown] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const again = useRef(false);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    if (inFlight.current) {
      again.current = true;
      return inFlight.current;
    }
    const run = (async () => {
      do {
        again.current = false;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const next = await jobsApi.get(accessToken, jobId, controller.signal);
          if (alive.current && next.jobId === jobId) {
            setJob(next);
            setError(null);
          }
        } catch {
          if (alive.current) setError("JOB_PROGRESS_UNAVAILABLE");
        } finally {
          clearTimeout(timer);
        }
      } while (again.current && alive.current);
      if (alive.current) setLoading(false);
    })();
    inFlight.current = run;
    await run.finally(() => {
      inFlight.current = null;
    });
  }, [accessToken, jobId, requestTimeoutMs]);

  // 실시간 구독
  useEffect(() => {
    alive.current = true;
    setLoading(true);
    setError(null);
    setRealtimeDown(false);
    setJob((prev) => (prev?.jobId === jobId ? prev : null));
    void refresh();

    const channel = supabase
      .channel(`job-${jobId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "job_sections", filter: `job_id=eq.${jobId}` },
        (payload) => {
          const row = sectionRealtimeRowSchema.safeParse(payload.new);
          if (!row.success) return void refresh();
          if (row.data.job_id === jobId && row.data.user_id === userId) void refresh();
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED")
          setRealtimeDown(true);
        if (status === "SUBSCRIBED") setRealtimeDown(false);
      });

    return () => {
      alive.current = false;
      void supabase.removeChannel(channel);
    };
  }, [jobId, userId, refresh]);

  // 폴링 백업
  useEffect(() => {
    const settled = job !== null && TERMINAL.has(job.status) && !realtimeDown;
    if (settled) return;
    const id = setInterval(() => void refresh(), pollIntervalMs);
    return () => clearInterval(id);
  }, [job, realtimeDown, pollIntervalMs, refresh]);

  /** 서버 응답을 기다리지 않고 섹션 하나를 바꿔 넣는다 (재시도·카피 저장 직후) */
  const replaceSection = useCallback((section: Section) => {
    setJob((prev) => {
      if (!prev || prev.sections.length === 0) return prev;
      const sections = prev.sections.map((s) => (s.index === section.index ? section : s));
      return { ...prev, sections, status: deriveJobStatus(sections) } as Job;
    });
  }, []);

  return { job, loading, error, realtimeDown, refresh, replaceSection };
}
