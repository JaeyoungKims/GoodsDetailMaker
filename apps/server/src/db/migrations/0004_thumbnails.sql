-- 옵션별·메인 썸네일(정사각)을 위한 테이블과, 동시 생성 슬롯·사용량 집계 확장

-- 옵션 사진은 기획·본문 이미지의 참조로 쓰지 않는다. 색이 다른 옵션 사진이 섞이면
-- 본문 13장의 제품 색이 흔들린다. loadInputImages 는 role='product' 만 읽는다.
alter table job_inputs add column role text not null default 'product'
  check (role in ('product','option'));

create table job_thumbnails (
  job_id            uuid not null references jobs(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  kind              text not null check (kind in ('main','option')),
  option_index      int  not null check (option_index between 0 and 8),  -- main = 0
  name              text not null default '',
  input_id          uuid,                        -- 이 옵션의 사진 (없으면 주력 사진 사용)
  status            text not null default 'queued'
                    check (status in ('queued','waiting_rate_limit','generating','completed','failed')),
  error_code        text,
  error_detail      text,
  attempt           int  not null default 0,
  manual_retries    int  not null default 0,
  raw_storage_key   text,
  raw_bytes         bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (job_id, kind, option_index)
);
create index job_thumbnails_gate_idx on job_thumbnails (user_id, status, updated_at);

create trigger job_thumbnails_touch before update on job_thumbnails
  for each row execute function touch_updated_at();

-- 진행 이벤트: 섹션과 같은 채널로 보낸다. section_index 는 null 이고 대신 kind 가 붙는다.
create or replace function notify_job_thumbnail_change()
returns trigger language plpgsql as $$
begin
  perform pg_notify('job_events', json_build_object(
    'job_id', new.job_id, 'user_id', new.user_id,
    'thumb_kind', new.kind, 'option_index', new.option_index, 'status', new.status)::text);
  return new;
end $$;
create trigger job_thumbnails_notify after insert or update on job_thumbnails
  for each row execute function notify_job_thumbnail_change();

-- 사용량: 썸네일 원본도 디스크를 차지한다
create or replace function storage_usage(p_user_id uuid)
returns table (user_bytes bigint, service_bytes bigint)
language sql stable as $$
  with per_job as (
    select j.user_id,
      coalesce((select sum(i.byte_size) from job_inputs i where i.job_id = j.id), 0)
      + greatest(
          j.reserved_bytes,
          coalesce((select sum(s.raw_bytes) from job_sections s where s.job_id = j.id), 0)
          + coalesce((select sum(t.raw_bytes) from job_thumbnails t where t.job_id = j.id), 0)
        ) as bytes
    from jobs j)
  select coalesce(sum(bytes) filter (where user_id = p_user_id), 0)::bigint,
         coalesce(sum(bytes), 0)::bigint
  from per_job;
$$;

-- 동시 생성 슬롯: 섹션과 썸네일이 같은 한도를 나눠 쓴다.
-- 이 합산을 빼면 썸네일이 슬롯 밖에서 돌아 사용자가 정한 동시 생성 수를 넘겨 호출한다.
create or replace function active_image_count(p_user_id uuid, p_stale_minutes int)
returns int language sql stable as $$
  select (
    (select count(*) from job_sections
      where user_id = p_user_id and status = 'generating'
        and updated_at > now() - make_interval(mins => p_stale_minutes))
    + (select count(*) from job_thumbnails
        where user_id = p_user_id and status = 'generating'
          and updated_at > now() - make_interval(mins => p_stale_minutes))
  )::int;
$$;

create or replace function claim_image_slot(
  p_user_id uuid, p_job_id uuid, p_index int, p_limit int, p_attempt int, p_stale_minutes int default 10)
returns boolean language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if active_image_count(p_user_id, p_stale_minutes) >= p_limit then return false; end if;
  update job_sections set status = 'generating', attempt = p_attempt, error_code = null
   where job_id = p_job_id and section_index = p_index and status in ('queued','waiting_rate_limit');
  return found;
end $$;

create or replace function claim_thumbnail_slot(
  p_user_id uuid, p_job_id uuid, p_kind text, p_index int, p_limit int, p_attempt int,
  p_stale_minutes int default 10)
returns boolean language plpgsql as $$
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  if active_image_count(p_user_id, p_stale_minutes) >= p_limit then return false; end if;
  update job_thumbnails set status = 'generating', attempt = p_attempt, error_code = null
   where job_id = p_job_id and kind = p_kind and option_index = p_index
     and status in ('queued','waiting_rate_limit');
  return found;
end $$;
