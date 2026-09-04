-- 기획 단계 실패 사유를 남긴다. job_sections 에는 이미 error_detail 이 있고 jobs 에만 없었다.
alter table jobs add column error_detail text;
