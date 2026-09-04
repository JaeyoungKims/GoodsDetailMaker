-- 본문 없이 썸네일만 만드는 작업을 허용한다 (section_count = 0)
alter table jobs drop constraint jobs_section_count_check;
alter table jobs add constraint jobs_section_count_check
  check (section_count between 0 and 13);
