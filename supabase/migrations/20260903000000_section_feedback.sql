-- 장별 사용자 피드백: 다음 재생성에 반영할 메모와 적용 이력
alter table public.job_sections
  add column if not exists feedback text,
  add column if not exists feedback_history jsonb not null default '[]'::jsonb;
