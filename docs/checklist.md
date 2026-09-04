# 작업 체크리스트

진행 중인 백로그 항목의 실제 작업 목록. 완료하면 `[x]` 로 바꾸고, 배경과 판단 근거는 `context-notes.md` 에 남긴다.

## B1. 단계 1~13 선택 (구현 완료 2026-09-04, 실제 환경 검증 대기)

사용자가 13단계 중 원하는 단계만 골라 순서를 정한다. 최소 1개, 최대 13개, 중복 없음.

### shared

- [x] `story.ts` 에 `STAGE_TO_ROLE: Record<StoryStage, SectionRole>` 추가 (단계 → role 1:1)
- [x] `brief.ts` 의 `storyOrderSchema` 를 "1..13개, 중복 없음" 으로 완화
- [x] `section.ts` 의 `sectionPlanListSchema` 를 storyOrder 를 받는 팩토리로 변경 (길이·role 슬롯을 storyOrder 기준으로)
- [x] `job.ts` 의 `jobSchema.sections` 를 "0..13개, index 오름차순" 으로 완화하고 role 슬롯 검증 제거
- [x] 고아가 된 `LEGACY_SECTION_COUNT` 제거, `SECTION_COUNT` 주석을 "최대 장 수" 로
- [x] 검증: 1개·3개·13개·중복·빈 배열, 옛 role 순서 작업 열기까지 테스트 추가 (14개 통과)

### ai

- [x] `buildSystemPrompt(storyOrder)` 가 "N개 섹션, index i = storyOrder[i] 단계 + 그 단계의 role" 로 출력 계약을 쓴다
- [x] 단계별 지침을 고른 단계만 싣는다. 빼둔 단계는 프롬프트에서 사라진다
- [x] `buildUserPrompt()` 가 `STAGE_TO_ROLE[stage]` 를 표기하고, 핵심 장점 배정 안내를 고른 단계에 맞춘다
- [x] 근거가 없을 때의 SUCCESS·OFFER 주의는 그 단계를 실제로 골랐을 때만 붙인다
- [x] `parsePlanText(text, storyOrder)` / `planSections` 가 `sectionPlanListSchema(storyOrder)` 로 검증
- [x] 검증: 3단계 브리프로 섹션 3개를 받는 테스트 포함 (15개 통과)

### server

- [x] 확인 결과 **수정 불필요**. `POST /api/jobs` 가 이미 `storyOrder.length` 를 `section_count` 에 저장하고, start 는 그 값으로 용량을 예약하며, `queue/plan.ts` 는 기획 결과 개수만큼 enqueue 한다
- [x] `sectionIndexParam` 상한(13)은 그대로 둔다 — 범위를 넘는 index 는 `getSection` 이 없어서 이미 `SECTION_NOT_FOUND` 다
- [x] 마이그레이션 없음 (`jobs.section_count` 컬럼이 이미 존재)
- [x] 검증: 기존 테스트 20개 통과

### web

- [x] `StoryOrderEditor` 에 단계 체크박스. 뺀 단계는 자리를 지킨 채 흐려지고 번호에서 빠진다
- [x] 최소 1개 보장 (마지막 한 개는 체크 해제 불가 + 안내 문구)
- [x] `CreationSummary` 가 `sectionCount` 를 받아 장수·비용·프레임·버튼 라벨에 반영
- [x] `NewJobPage` 헤더·포인트 문구를 고른 장 수 기준으로
- [x] `JobPage` 진행바·기획 중 문구를 `job.storyOrder.length` 기준으로
- [x] `sectionFileName(index, role)` 로 바꾸고 `exportZip`·`JobPage` 호출부 수정
- [x] `InfoPage` 는 소개 페이지이므로 "최대 13장" 과 "내가 고른 단계" 로 문구 조정
- [x] 검증: web 테스트 7개 통과, `vite build` 성공

### 완료 기준

- [x] `pnpm format && pnpm -r typecheck && pnpm -r test` 통과 (테스트 56개)
- [ ] 3단계만 골라 만든 작업이 기획 → 이미지 3장 → 미리보기 → ZIP·합본까지 성공 (실제 키·서버 필요)
- [ ] 기존 13장 작업이 그대로 열리고 내보내기까지 동작 (실제 DB 필요)
