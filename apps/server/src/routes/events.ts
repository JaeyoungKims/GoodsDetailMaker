import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { HonoEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import { findJob } from "../services/jobs.js";
import { jobEvents } from "../services/events.js";

/**
 * 작업 진행 SSE. job_sections 트리거의 NOTIFY 를 받아 브라우저에 밀어준다.
 * 브라우저는 이벤트를 받으면 GET /api/jobs/:id 로 전체 상태를 다시 읽는다 (Supabase Realtime 과 같은 방식).
 */
export const eventRoutes = new Hono<HonoEnv>().get("/:jobId/events", async (c) => {
  const { sql } = c.get("ctx");
  const user = c.get("user");
  const jobId = c.req.param("jobId");
  const job = await findJob(sql, user.id, jobId);
  if (!job) throw new ApiError("JOB_NOT_FOUND", 404);

  return streamSSE(c, async (stream) => {
    let alive = true;
    const unsubscribe = jobEvents.subscribe(jobId, (payload) => {
      if (!alive) return;
      void stream.writeSSE({ event: "section", data: JSON.stringify(payload) });
    });
    stream.onAbort(() => {
      alive = false;
      unsubscribe();
    });
    await stream.writeSSE({ event: "ready", data: jobId });
    // 프록시·브라우저가 연결을 끊지 않도록 25초마다 주석 핑
    while (alive) {
      await stream.sleep(25_000);
      if (alive) await stream.writeSSE({ event: "ping", data: String(Date.now()) });
    }
  });
});
