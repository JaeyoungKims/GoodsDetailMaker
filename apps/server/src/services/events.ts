import type { Sql } from "../db/client.js";

export interface SectionEvent {
  job_id: string;
  user_id: string;
  section_index: number;
  status: string;
}

type Listener = (payload: SectionEvent) => void;

/** Postgres LISTEN job_events → 작업별 구독자에게 전달. 프로세스당 연결 하나. */
class JobEventHub {
  private listeners = new Map<string, Set<Listener>>();

  subscribe(jobId: string, listener: Listener): () => void {
    let set = this.listeners.get(jobId);
    if (!set) {
      set = new Set();
      this.listeners.set(jobId, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
      if (set && set.size === 0) this.listeners.delete(jobId);
    };
  }

  emit(payload: SectionEvent) {
    this.listeners.get(payload.job_id)?.forEach((l) => l(payload));
  }

  async attach(sql: Sql) {
    await sql.listen("job_events", (raw) => {
      try {
        this.emit(JSON.parse(raw) as SectionEvent);
      } catch {
        /* 잘못된 페이로드는 무시 */
      }
    });
  }
}

export const jobEvents = new JobEventHub();
