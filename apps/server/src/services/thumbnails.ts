// 옵션별·메인 썸네일 행의 조회와 갱신 (섹션과 달리 카피·버전이 없다)
import { thumbnailSchema, type ProductOption, type Thumbnail } from "@gdm/shared";
import type { Sql } from "../db/client.js";

export interface ThumbnailRow {
  job_id: string;
  user_id: string;
  kind: "main" | "option";
  option_index: number;
  name: string;
  input_id: string | null;
  status: string;
  error_code: string | null;
  error_detail: string | null;
  attempt: number;
  manual_retries: number;
  raw_storage_key: string | null;
  raw_bytes: number;
}

export function toThumbnail(row: ThumbnailRow): Thumbnail {
  return thumbnailSchema.parse({
    kind: row.kind,
    optionIndex: row.option_index,
    name: row.name,
    status: row.status,
    errorCode: row.error_code,
    errorDetail: row.error_detail,
  });
}

export async function listThumbnails(sql: Sql, jobId: string): Promise<ThumbnailRow[]> {
  return sql<ThumbnailRow[]>`
    select * from job_thumbnails where job_id = ${jobId}
     order by (kind = 'option'), option_index`;
}

export async function getThumbnail(
  sql: Sql,
  jobId: string,
  kind: string,
  optionIndex: number,
): Promise<ThumbnailRow | null> {
  const [row] = await sql<ThumbnailRow[]>`
    select * from job_thumbnails
     where job_id = ${jobId} and kind = ${kind} and option_index = ${optionIndex}`;
  return row ?? null;
}

/**
 * 작업을 만들 때 썸네일 행을 미리 만든다.
 * 마켓 목록에 걸 썸네일은 옵션이 있든 없든 필요하다. 옵션이 없으면 메인 한 장을 만들고,
 * 옵션이 있으면 옵션마다 한 장씩 만든다(그때의 메인은 브라우저 격자 합성이 기본).
 */
export async function insertJobThumbnails(
  sql: Sql,
  userId: string,
  jobId: string,
  options: ProductOption[],
) {
  if (options.length === 0) {
    await sql`
      insert into job_thumbnails (job_id, user_id, kind, option_index, name, status)
      values (${jobId}, ${userId}, 'main', 0, '', 'queued')
      on conflict do nothing`;
    return;
  }
  const rows = options.map((option, i) => ({
    job_id: jobId,
    user_id: userId,
    kind: "option",
    option_index: i + 1,
    name: option.name,
    input_id: option.inputId ?? null,
    status: "queued",
  }));
  await sql`insert into job_thumbnails ${sql(rows)} on conflict do nothing`;
}

/** 메인(AI 배치)은 사용자가 버튼을 눌렀을 때만 만든다. 기본 메인은 브라우저 격자 합성이다. */
export async function upsertMainThumbnail(sql: Sql, userId: string, jobId: string) {
  await sql`
    insert into job_thumbnails (job_id, user_id, kind, option_index, name, status)
    values (${jobId}, ${userId}, 'main', 0, '', 'queued')
    on conflict (job_id, kind, option_index) do update
      set status = 'queued', error_code = null, error_detail = null, attempt = 0`;
}

const THUMBNAIL_COLUMNS = new Set([
  "status",
  "error_code",
  "error_detail",
  "attempt",
  "manual_retries",
  "raw_storage_key",
  "raw_bytes",
]);

export async function updateThumbnail(
  sql: Sql,
  jobId: string,
  kind: string,
  optionIndex: number,
  patch: Record<string, unknown>,
) {
  const cols = Object.keys(patch).filter((k) => THUMBNAIL_COLUMNS.has(k));
  if (cols.length === 0) return;
  await sql`update job_thumbnails set ${sql(patch as Record<string, never>, ...(cols as never[]))}
            where job_id = ${jobId} and kind = ${kind} and option_index = ${optionIndex}`;
}
