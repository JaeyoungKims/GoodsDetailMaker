-- 상세페이지 13장 제작실 초기 스키마
-- 적용: supabase db push  (또는 SQL Editor 에 붙여넣기)

create extension if not exists pgcrypto;
create extension if not exists supabase_vault;

-- ───────────────────────── enums ─────────────────────────
create type public.job_status as enum
  ('draft','queued','planning','generating','partial','completed','failed');
create type public.section_status as enum
  ('queued','waiting_rate_limit','generating','completed','failed');

-- ───────────────────────── updated_at 트리거 ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── user_settings ─────────────────────────
create table public.user_settings (
  user_id               uuid primary key references auth.users(id) on delete cascade,
  openai_key_secret_id  uuid,                       -- vault.secrets.id
  openai_key_last_four  text check (openai_key_last_four ~ '^[A-Za-z0-9_-]{4}$'),
  image_parallelism     int  not null default 5 check (image_parallelism in (5, 10)),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.touch_updated_at();

-- ───────────────────────── jobs ─────────────────────────
create table public.jobs (
  id                        uuid primary key,                  -- 클라이언트 생성 UUID (Idempotency-Key)
  user_id                   uuid not null references auth.users(id) on delete cascade,
  status                    public.job_status not null default 'draft',
  product_name              text not null default '',
  brief                     jsonb not null,
  story_order               text[] not null,
  section_count             int  not null default 13 check (section_count in (10, 13)),
  image_generation_enabled  boolean not null default true,
  error_code                text,
  expires_at                timestamptz not null default now() + interval '24 hours',
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);
create index jobs_user_created_idx on public.jobs (user_id, created_at desc);
create index jobs_expires_idx on public.jobs (expires_at);
create trigger jobs_touch before update on public.jobs
  for each row execute function public.touch_updated_at();

-- ───────────────────────── job_inputs (입력 이미지) ─────────────────────────
create table public.job_inputs (
  id              uuid primary key,
  job_id          uuid not null references public.jobs(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  position        int  not null,                      -- 0 = 주력 제품
  r2_key          text not null,
  content_type    text not null,
  byte_size       bigint not null check (byte_size > 0),
  status          text not null default 'pending' check (status in ('pending','stored')),
  upload_attempts int  not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index job_inputs_job_idx on public.job_inputs (job_id, position);
create trigger job_inputs_touch before update on public.job_inputs
  for each row execute function public.touch_updated_at();

-- ───────────────────────── job_sections (이미지 13장) ─────────────────────────
create table public.job_sections (
  job_id            uuid not null references public.jobs(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
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
  status            public.section_status not null default 'queued',
  error_code        text,
  copy_version      int  not null default 1,
  attempt           int  not null default 0,
  manual_retries    int  not null default 0,
  raw_r2_key        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (job_id, section_index)
);
create index job_sections_user_idx on public.job_sections (user_id);
create trigger job_sections_touch before update on public.job_sections
  for each row execute function public.touch_updated_at();

-- Realtime: 클라이언트가 job_id 필터로 상태 변화를 구독한다
alter publication supabase_realtime add table public.job_sections;
alter table public.job_sections replica identity full;

-- ───────────────────────── RLS ─────────────────────────
-- 쓰기는 모두 Worker(service role) 가 한다. 사용자는 자기 행 읽기만 가능 (Realtime 권한용).
alter table public.user_settings enable row level security;
alter table public.jobs          enable row level security;
alter table public.job_inputs    enable row level security;
alter table public.job_sections  enable row level security;

create policy "own settings read"  on public.user_settings for select using (auth.uid() = user_id);
create policy "own jobs read"      on public.jobs          for select using (auth.uid() = user_id);
create policy "own inputs read"    on public.job_inputs    for select using (auth.uid() = user_id);
create policy "own sections read"  on public.job_sections  for select using (auth.uid() = user_id);

-- ───────────────────────── Vault: OpenAI 키 ─────────────────────────
-- 키 원문은 이 함수들로만 드나든다. service_role 에게만 실행 권한을 준다.

create or replace function public.set_openai_key(p_user_id uuid, p_key text)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_last_four text := right(p_key, 4);
begin
  select openai_key_secret_id into v_secret_id from public.user_settings where user_id = p_user_id;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_key, 'openai:' || p_user_id::text, 'user OpenAI API key');
  else
    perform vault.update_secret(v_secret_id, p_key, 'openai:' || p_user_id::text, 'user OpenAI API key');
  end if;

  insert into public.user_settings (user_id, openai_key_secret_id, openai_key_last_four)
  values (p_user_id, v_secret_id, v_last_four)
  on conflict (user_id) do update
    set openai_key_secret_id = excluded.openai_key_secret_id,
        openai_key_last_four = excluded.openai_key_last_four;

  return v_last_four;
end $$;

create or replace function public.get_openai_key(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
  v_key text;
begin
  select openai_key_secret_id into v_secret_id from public.user_settings where user_id = p_user_id;
  if v_secret_id is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where id = v_secret_id;
  return v_key;
end $$;

create or replace function public.delete_openai_key(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_secret_id uuid;
begin
  select openai_key_secret_id into v_secret_id from public.user_settings where user_id = p_user_id;
  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;
  update public.user_settings
    set openai_key_secret_id = null, openai_key_last_four = null
    where user_id = p_user_id;
end $$;

revoke all on function public.set_openai_key(uuid, text)  from public, anon, authenticated;
revoke all on function public.get_openai_key(uuid)        from public, anon, authenticated;
revoke all on function public.delete_openai_key(uuid)     from public, anon, authenticated;
grant execute on function public.set_openai_key(uuid, text)  to service_role;
grant execute on function public.get_openai_key(uuid)        to service_role;
grant execute on function public.delete_openai_key(uuid)     to service_role;
