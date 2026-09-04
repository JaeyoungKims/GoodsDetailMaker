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
- [x] 3단계만 골라 만든 작업이 기획 → 이미지 3장 생성까지 실제 환경에서 성공
      (2026-09-04, 작업 `46b6e8b1`. role 이 HERO / BENEFIT_A / PRODUCT_INFO 로 매핑대로 나왔고
      raw 3개 파일 저장, status=completed)
- [x] 기존 13장 작업(`4f653ecf`)이 그대로 열린다 — role 이 옛 슬롯 순서인데도 13장 completed 로 응답
- [ ] 브라우저에서 미리보기·JPG·ZIP·세로 합본 확인 (Canvas 합성 경로. 로그인한 브라우저 필요)

## B2. 옵션별 썸네일 + 메인 썸네일 (완료 2026-09-04)

마켓 목록에 걸리는 정사각 썸네일을 만든다. 옵션마다 1장, 옵션 여럿을 한 장에 담은 메인 1장.
생성은 1024×1024, 내보낼 때 브라우저에서 1000×1000 으로 줄인다. 문구는 넣지 않는다(마켓 정책).

### shared

- [x] `constants.ts` 에 `THUMB_SOURCE_SIZE = 1024`, `THUMB_EXPORT_SIZE = 1000`, `OPTION_MAX = 8` 추가
- [x] `brief.ts` 에 `options: [{ name, inputId? }]` (≤8, 이름 필수·사진 선택)
- [x] `schemas/thumbnail.ts` 신설 — `thumbnailKind('main'|'option')`, `thumbnailSchema`, 상태·에러 코드
- [x] `jobSchema` 에 `thumbnails` 배열 추가 (없으면 빈 배열)
- [x] `queue.ts` 에 `{kind:"thumbnail", thumbKind, optionIndex}` 메시지 추가
- [x] `errors.ts` 에 썸네일 관련 코드 추가

### DB (마이그레이션 0004)

- [x] `job_thumbnails` 테이블 (job_id, user_id, kind, option_index, name, input_id, status, attempt, manual_retries, error_code, error_detail, raw_storage_key, raw_bytes)
- [x] `job_inputs.role` 추가 ('product' | 'option') — 기존 행은 'product'
- [x] `claim_image_slot` 을 job_sections + job_thumbnails 합산으로 교체
- [x] `claim_thumbnail_slot` 신규
- [x] `storage_usage` 에 job_thumbnails 바이트 합산
- [x] job_thumbnails 상태 변경 NOTIFY 트리거 (SSE)

### server

- [x] `POST /api/jobs` 가 options 를 읽어 job_thumbnails 행을 미리 만든다
- [x] 입력 업로드에 `role=option` 경로 (옵션 사진은 기획 참조에서 제외)
- [x] `loadInputImages` 는 role='product' 만 로드
- [x] start 시 예약 용량에 썸네일 장수 반영
- [x] `queue/thumbnail.ts` — 게이트 → images/edits(1024×1024) → raw 저장
- [x] `POST /api/jobs/:id/thumbnails/main` — AI 배치 메인을 따로 요청
- [x] `GET /api/jobs/:id/thumbnails/:kind/:index/raw`
- [x] 재시도 라우트

### ai

- [x] `generateThumbnailImage()` — 1024×1024, 문구 없음, 마켓 썸네일 규칙 프롬프트
- [x] 옵션 썸네일 프롬프트(제품 단독 정면)와 메인 AI 배치 프롬프트(여러 옵션 한 장면) 분리

### web

- [x] 새 상세페이지에 "옵션" 카드 — 옵션명 + 사진 1장, 최대 8개, 추가·삭제
- [x] 진행 화면에 썸네일 섹션 (메인 1 + 옵션 N)
- [x] 썸네일 미리보기는 1024 원본 → 1000×1000 축소 후 표시·다운로드
- [x] 메인 썸네일 격자 합성(Canvas, 기본·무료)과 "AI로 한 장면 만들기" 버튼 둘 다 제공
- [x] ZIP 내보내기에 썸네일 포함 (`thumb-main.jpg`, `thumb-01-옵션명.jpg`)
- [x] `assertJpegDimensions` 를 규격 인자로 받게 바꿔 1024×1024 도 검증

### 완료 기준

- [x] 옵션 2개짜리 작업에서 옵션 썸네일 2장 + 격자 메인 1장이 나온다
- [x] AI 배치 메인을 따로 눌러 만들 수 있다
- [x] 옵션을 하나도 넣지 않은 작업은 지금과 똑같이 동작한다 (썸네일 섹션 자체가 없음)
- [x] `pnpm format && pnpm -r typecheck && pnpm -r test` 통과
