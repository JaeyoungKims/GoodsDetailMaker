-- 관리자가 발급하는 비밀번호 재설정 토큰. 소셜 로그인 연결은 0001 의 user_identities 를 그대로 쓴다.
create table password_resets (
  id          text primary key,                        -- 토큰 해시. 원문은 발급된 링크에만 실린다
  user_id     uuid not null references users(id) on delete cascade,
  issued_by   uuid references users(id) on delete set null,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index password_resets_user_idx on password_resets (user_id);
