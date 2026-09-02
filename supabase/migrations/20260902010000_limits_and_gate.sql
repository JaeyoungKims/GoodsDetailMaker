-- 한도·동시 생성 게이트 지원 컬럼과 함수

alter table public.jobs          add column reserved_bytes     bigint not null default 0;
alter table public.job_sections  add column raw_bytes          bigint not null default 0;
alter table public.user_settings add column rate_limited_until timestamptz;

create index jobs_user_status_idx   on public.jobs (user_id, status);
create index job_sections_gate_idx  on public.job_sections (user_id, status, updated_at);

-- ───────────────────────── 저장 공간 사용량 ─────────────────────────
-- 작업별 = 입력 이미지 합 + max(예약 공간, 실제 원본 응답 합). 사용자 합계와 서비스 합계를 함께 돌려준다.
create or replace function public.storage_usage(p_user_id uuid)
returns table (user_bytes bigint, service_bytes bigint)
language sql
stable
as $$
  with per_job as (
    select
      j.user_id,
      coalesce((select sum(i.byte_size) from public.job_inputs i where i.job_id = j.id), 0)
        + greatest(j.reserved_bytes,
                   coalesce((select sum(s.raw_bytes) from public.job_sections s where s.job_id = j.id), 0))
        as bytes
    from public.jobs j
  )
  select
    coalesce(sum(bytes) filter (where user_id = p_user_id), 0)::bigint as user_bytes,
    coalesce(sum(bytes), 0)::bigint as service_bytes
  from per_job;
$$;

-- ───────────────────────── 동시 생성 슬롯 점유 ─────────────────────────
-- 사용자 단위 advisory lock 안에서 generating 수를 세고, 한도 미만일 때만 해당 섹션을 generating 으로 바꾼다.
-- 오래된 generating(죽은 워커)은 세지 않는다.
create or replace function public.claim_image_slot(
  p_user_id uuid,
  p_job_id uuid,
  p_index int,
  p_limit int,
  p_attempt int,
  p_stale_minutes int default 10
)
returns boolean
language plpgsql
as $$
declare
  v_active int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));

  select count(*) into v_active
    from public.job_sections
   where user_id = p_user_id
     and status = 'generating'
     and updated_at > now() - make_interval(mins => p_stale_minutes);

  if v_active >= p_limit then
    return false;
  end if;

  update public.job_sections
     set status = 'generating', attempt = p_attempt, error_code = null
   where job_id = p_job_id
     and section_index = p_index
     and status in ('queued', 'waiting_rate_limit');

  return found;
end $$;

revoke all on function public.storage_usage(uuid) from public, anon, authenticated;
revoke all on function public.claim_image_slot(uuid, uuid, int, int, int, int) from public, anon, authenticated;
grant execute on function public.storage_usage(uuid) to service_role;
grant execute on function public.claim_image_slot(uuid, uuid, int, int, int, int) to service_role;
