-- 섹션 실패 사유(제공자 응답 메시지 등)를 보관해 화면에 보여준다
alter table public.job_sections add column if not exists error_detail text;
