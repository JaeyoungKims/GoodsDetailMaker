# 현황과 백로그 (2026-09-04 기준)

브랜치: `claude/product-detail-page-generator-jipts6` (main 미병합). 로컬 개발도 이 브랜치에서 한다.
저장소: `JaeyoungKims/GoodsDetailMaker` 하나만 쓴다. 2026-09-04 에 잠시 갈라졌던 사본(`jaeyoung22000/GoodsDetailMaker`)은 정리했다.

**2026-09-03 구조 전환**: Cloudflare Workers·Queues·R2·Supabase 를 걷어내고 집 PC 자체 호스팅(Node + Postgres + 디스크)으로 바꿨다. 이전 클라우드 버전은 git 이력(`4fc01cb` 이전)에 있다.

## 1. 완료된 것

| 영역          | 내용                                                                               | 검증                        |
| ------------- | ---------------------------------------------------------------------------------- | --------------------------- |
| 역분석        | 참고 사이트 화면·API·모델·합성 규칙 문서화                                         | docs/reference              |
| 모노레포      | web / server / shared / ai, pnpm, prettier, vitest                                 | typecheck·test 통과         |
| 인증          | 쿠키 세션(이메일·비밀번호), 소셜 로그인 3종, 관리자 발급 비밀번호 재설정 링크      | 로컬 로그인 성공            |
| 설정          | OpenAI 키 암호화 저장/삭제, 동시 생성 5/10, 소셜 계정 연결·해제                    | 실제 저장 성공              |
| 새 상세페이지 | 브리프·스타일 칩·이미지 드롭존(시그니처 검사)·설득 순서 편집·요약 카드·이어서 시도 | 실제 업로드 성공            |
| 서버 API      | jobs 7개, settings 5개, auth(세션·OAuth·재설정), 한도, 초안 자동 정리              | 실제 호출 성공              |
| 기획          | 프롬프트(단계별 목표·대체 규칙·스타일), strict JSON, repair 1회                    | **실제 13장 기획 성공**     |
| 이미지        | gpt-image-2 edits 호출, 게이트(감속·슬롯), 재시도, 실패 사유 기록                  | **실제 13장 생성 성공**     |
| 진행 화면     | SSE + 7초 폴링, 섹션 카드 편집·재시도·재생성, Canvas 합성, JPG/ZIP/합본            | 실제 환경에서 합본까지 확인 |
| 정보 페이지   | 소개·도움말·개인정보·이용조건                                                      | 렌더링 확인                 |
| 디자인        | 인디고·쿨그레이 계열, 참고 사이트와 다른 레이아웃                                  | 캡처 확인                   |
| 문서          | setup.md, architecture.md, CLAUDE.md                                               | -                           |

## 2. 검증 이력

- 2026-09-03: 정상 JPEG 로 새 작업 → 기획 → 이미지 13장 → 미리보기 → 세로 합본 다운로드까지 실제 환경에서 성공.
- 이전 실패(`invalid_image_file`)는 참조 사진 파일 문제였음. 업로드 시 시그니처 검사로 재발 방지(`9c13e38`).
- 2026-09-04: 서버 실행을 tsx 로 전환(`b3990e5`), 게이트 판정 테스트 복원(`719200a`), 소셜 로그인·재설정 추가(`aaf1c4a`), OAuth 열린 리다이렉트 차단(`15ac169`), 크레딧 소진 분리(`0c3b734`).

## 3. 알려진 이슈·주의

- 소셜 로그인은 `PUBLIC_BASE_URL` 기준으로 콜백을 만든다. 구글이 사설 IP 를 콜백으로 받아 주지 않아, 도메인·HTTPS 를 붙이기 전에는 localhost 접속에서만 동작한다. 콘솔 등록 절차는 `docs/setup.md` 5-1·5-2 절.
- 네이버는 이메일 검증 여부를 주지 않으므로 같은 이메일의 기존 계정에 자동 연결하지 않는다. 설정 화면에서 로그인 상태로 직접 연결해야 한다.
- 비밀번호 재설정은 SMTP 가 없어 관리자가 링크를 만들어 직접 전달한다. 링크는 24시간·1회용.
- 폰트 `apps/web/public/fonts/NotoSansKR-Variable.woff2` 미포함. 없으면 시스템 폰트로 합성.
- 도움말의 운영 문의 채널 미기입.
- 기획 모델명 `gpt-5-mini`, 이미지 모델 `gpt-image-2` 는 `.env` 의 `PLAN_MODEL`, `IMAGE_MODEL` 로 교체 가능.
- 구 스택 이름 잔재가 남아 있다. `sectionRealtimeRowSchema`, `realtimeDown` 은 실제로는 SSE 경로다. 동작에는 문제가 없어 손대지 않았다.
- `pnpm dev` 에서 서버 console 출력이 안 보였던 원인은 옛 코드 실행이었다. 커밋 확인 습관 필요.

## 4. 백로그 (우선순위 순)

### B1. 단계 1~13 선택 (진행 중)

사용자가 13단계 중 원하는 단계만 골라 순서를 정한다. 최소 1개.

- shared: `storyOrderSchema` 를 "1..13개, 중복 없음" 으로 완화. `STAGE_TO_ROLE` 매핑 추가(단계→role 1:1). `sectionPlanListSchema`/`jobSchema` 의 길이 조건을 storyOrder 길이로.
  - 제안 매핑: HERO→HERO, PROBLEM→PROBLEM, GAP→BENEFIT_A, GUIDE→BENEFIT_B, CORE_REASON→SOLUTION, PLAN→DETAIL, OFFER→CTA, SUCCESS→REVIEW, LOSS→COMPARISON, CLOSING→GIFT, SITUATIONS→USAGE, BENEFIT_ARCHIVE→TRUST, PRODUCT_INFO→PRODUCT_INFO
- server: 프롬프트 "N개 섹션, index i = storyOrder[i] 단계·role". `insertPlannedSections` N개. start 시 예약 용량 N×3MB. `jobs.section_count` 저장.
- web: StoryOrderEditor 에 체크박스(선택/해제), 요약 카드·헤더·진행바·파일명(`-N장.zip`)·비용 문구를 N 기준으로.
- 완료 기준: 3장 작업이 끝까지 성공, 13장 기존 작업도 열림.

### B2. 옵션별 썸네일 + 메인 썸네일 (1000×1000)

- 브리프에 `options: [{ name, inputId? }]` (≤8). 폼에 "옵션" 카드: 옵션명 + 옵션 사진 1장.
- 생성: 1024×1024 로 만들고 브라우저에서 1000×1000 축소. 문구 없음(마켓 썸네일 정책).
  - 개별: 옵션 사진을 참조로 1장씩. 메인: 옵션 사진들을 함께 참조로 넣어 한 장면에 배치. 대안으로 브라우저 격자 합성.
- DB: `job_thumbnails(job_id, kind main|option, option_index, status, raw_key, error_code, error_detail)` 또는 job_sections 확장. 큐 메시지 `{kind:"thumbnail"}`.
- 진행 화면에 썸네일 섹션(메인 1 + 옵션 N), 내보내기에 포함.

### B3. 사용량·비용 리포트

- OpenAI: 기획·이미지 응답의 `usage` 를 `job_usage(job_id, kind, model, input_tokens, output_tokens, images, est_cost_usd)` 에 기록. 단가표는 `PRICING_JSON` 환경변수. 응답 헤더 `x-ratelimit-remaining-*` 도 저장.
  - 잔여 크레딧(잔액)은 일반 키로 조회 불가 → 대시보드 링크 안내. 조직 관리자 키가 있으면 운영자 화면에서만.
- 저장 용량·작업 수는 우리가 재는 값을 운영자 화면에.
- 진행 화면 하단에 "이 작업의 사용량" 카드, 설정에 "내 누적 사용량".

### B4. 스타일 사후 변경 (재생성)

완성된 작업에서 스타일(tone)을 바꿔 다시 만든다. 카피는 유지하고 장면·이미지 프롬프트만 재기획.

- API: `PATCH /api/jobs/:id/style { tone }` → jobs.brief.tone 갱신, `{kind:"plan", mode:"restyle"}` enqueue.
- 프롬프트: restyle 모드는 기존 headline/subheadline/bullets 를 입력으로 주고 visualDirection·imagePrompt 만 새로 받는다.
- 컨슈머: 섹션 행의 visual_direction/image_prompt 만 갱신하고 status=queued, copy_version 유지 → image ×N.
- 웹: 진행 화면 상단에 스타일 칩 + "이 스타일로 다시 만들기"(비용 확인 confirm). 섹션 단위 변경은 후순위.
- 비용: 이미지 N장 + 기획 1회.

### B5. 운영 준비

도메인·HTTPS, SMTP, 폰트 파일, 운영 문의 채널, 소셜 제공자 콘솔에 실제 콜백 등록.

## 5. 병행 개발 규칙

- 한 기능 = 한 브랜치(`feat/<이름>`), 이 브랜치에서 분기. 끝나면 이 브랜치로 PR 또는 머지.
- 파일 경계로 충돌을 피한다: B1 은 shared/story·prompt·StoryOrderEditor, B2 는 새 파일(thumbnail*) 위주, B3 은 새 테이블·새 화면.
- `packages/shared` 스키마를 바꾸면 web·server 양쪽 typecheck 를 반드시 돌린다.
- 마이그레이션은 새 파일로만 추가. 번호는 순번.
- 커밋 메시지는 `feat|fix|docs|chore(scope): 요약`, 본문은 한국어.
