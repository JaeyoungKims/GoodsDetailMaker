-- 자체 호스팅 초기 스키마. Supabase 의존(auth.users, vault, realtime) 없이 동작한다.
create extension if not exists pgcrypto;

-- ───────────── 사용자·세션·외부 로그인 ─────────────
create table users (
  id            uuid primary key default gen_random_uuid(),
  email         text not null unique,
  password_hash text,                          -- 소셜 로그인만 쓰는 계정은 null
  display_name  text,
  role          text not null default 'user' check (role in ('user','admin')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 구글·네이버·카카오 등 외부 계정 연결 (추후 확장)
create table user_identities (
  provider          text not null,             -- 'google' | 'naver' | 'kakao' | ...
  provider_user_id  text not null,
  user_id           uuid not null references users(id) on delete cascade,
  profile           jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  primary key (provider, provider_user_id)
);
create index user_identities_user_idx on user_identities (user_id);

create table sessions (
  id          text primary key,                -- 무작위 토큰 해시
  user_id     uuid not null references users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  user_agent  text
);
create index sessions_user_idx on sessions (user_id);
create index sessions_expires_idx on sessions (expires_at);

-- ───────────── 설정 ─────────────
create table user_settings (
  user_id               uuid primary key references users(id) on delete cascade,
  openai_key_encrypted  text,                  -- AES-256-GCM (APP_SECRET 파생 키)
  openai_key_last_four  text check (openai_key_last_four ~ '^[A-Za-z0-9_-]{4}$'),
  image_parallelism     int  not null default 5 check (image_parallelism in (5, 10)),
  rate_limited_until    timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- ───────────── 작업 ─────────────
create table jobs (
  id                        uuid primary key,
  user_id                   uuid not null references users(id) on delete cascade,
  status                    text not null default 'draft'
                            check (status in ('draft','queued','planning','generating','partial','completed','failed')),
  product_name              text not null default '',
  brief                     jsonb not null,
  story_order               text[] not null,
  section_count             int  not null default 13 check (section_count between 1 and 13),
  image_generation_enabled  boolean not null default true,
  error_code                text,
  reserved_bytes            bigint not null default 0,
  expires_at                timestamptz,       -- null = 무제한 보관
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index jobs_user_created_idx on jobs (user_id, created_at desc);
create index jobs_user_status_idx  on jobs (user_id, status);
create index jobs_expires_idx      on jobs (expires_at) where expires_at is not null;

create table job_inputs (
  id              uuid primary key,
  job_id          uuid not null references jobs(id) on delete cascade,
  user_id         uuid not null references users(id) on delete cascade,
  position        int  not null,
  storage_key     text not null,               -- DATA_DIR 기준 상대경로
  content_type    text not null,
  byte_size       bigint not null check (byte_size > 0),
  status          text not null default 'pending' check (status in ('pending','stored')),
  upload_attempts int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index job_inputs_job_idx on job_inputs (job_id, position);

create table job_sections (
  job_id            uuid not null references jobs(id) on delete cascade,
  user_id           uuid not null references users(id) on delete cascade,
  section_index     int  not null check (section_index between 1 and 13),
  role              text not null,
  headline          text not null,
  subheadline       text not null default '',
  bullets           text[] not null default '{}',
  visual_direction  text not null,
  image_prompt      text not null,
  copy_placement    text not null default 'bottom' check (copy_placement in ('top','center','bottom')),
  render_mode       text not null default 'browser_overlay'
                    check (render_mode in ('browser_overlay','image_model_text')),
  status            text not null default 'queued'
                    check (status in ('queued','waiting_rate_limit','generating','completed','failed')),
  error_code        text,
  error_detail      text,
  feedback          text,
  feedback_history  jsonb not null default '[]'::jsonb,
  copy_version      int  not null default 1,
  attempt           int  not null default 0,
  manual_retries    int  not null default 0,
  raw_storage_key   text,
  raw_bytes         bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (job_id, section_index)
);
create index job_sections_gate_idx on job_sections (user_id, status, updated_at);

-- ───────────── 진행 이벤트 (SSE 용) ─────────────
-- 섹션 상태가 바뀔 때마다 NOTIFY 로 서버가 브라우저에 밀어준다.
create or replace function notify_job_section_change()
returns trigger language plpgsql as $$
begin
  perform pg_notify('job_events', json_build_object(
    'job_id', new.job_id, 'user_id', new.user_id,
    'section_index', new.section_index, 'status', new.status)::text);
  return new;
end $$;
create trigger job_sections_notify after insert or update on job_sections
  for each row execute function notify_job_section_change();

-- updated_at
create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger users_touch         before update on users         for each row execute function touch_updated_at();
create trigger user_settings_touch before update on user_settings for each row execute function touch_updated_at();
create trigger jobs_touch          before update on jobs          for each row execute function touch_updated_at();
create trigger job_inputs_touch    before update on job_inputs    for each row execute function touch_updated_at();
create trigger job_sections_touch  before update on job_sections  for each row execute function touch_updated_at();

-- ───────────── 함수: 저장 사용량, 동시 생성 슬롯 ─────────────
create or replace function storage_usage(p_user_id uuid)
returns table (user_bytes bigint, service_bytes bigint)
language sql stable as $$
  with per_job as (
    select j.user_id,
      coalesce((select sum(i.byte_size) from job_inputs i where i.job_id = j.id), 0)
      + greatest(j.reserved_bytes, coalesce((select sum(s.raw_bytes) from job_sections s where s.job_id = j.id), 0)) as bytes
    from jobs j)
  select coalesce(sum(bytes) filter (where user_id = p_user_id), 0)::bigint,
         coalesce(sum(bytes), 0)::bigint
  from per_job;
$$;

create or replace function claim_image_slot(
  p_user_id uuid, p_job_id uuid, p_index int, p_limit int, p_attempt int, p_stale_minutes int default 10)
returns boolean language plpgsql as $$
declare v_active int;
begin
  perform pg_advisory_xact_lock(hashtext(p_user_id::text));
  select count(*) into v_active from job_sections
   where user_id = p_user_id and status = 'generating'
     and updated_at > now() - make_interval(mins => p_stale_minutes);
  if v_active >= p_limit then return false; end if;
  update job_sections set status = 'generating', attempt = p_attempt, error_code = null
   where job_id = p_job_id and section_index = p_index and status in ('queued','waiting_rate_limit');
  return found;
end $$;
