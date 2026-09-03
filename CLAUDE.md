# GoodsDetailMaker — 프로젝트 안내 (Claude Code / 개발자용)

상품 사진·정보를 한 번 입력하면 AI가 구매 퍼널 N단계를 기획하고 각 단계를 1024×1536 이미지로 독립 생성하는
BYOK(사용자 본인 OpenAI 키) 상세페이지 도구. 한국어 UI, 국내 셀러 대상.

- 현황·백로그: `docs/status.md` (먼저 읽을 것)
- 아키텍처: `docs/architecture.md` / 셋업: `docs/setup.md` / 참고 사이트 역분석: `docs/reference/`

## 구조

```
apps/web         React 19 + Vite 7 + React Router 7. 인증(Supabase), /api 호출, Canvas 카피 합성, ZIP·합본 내보내기
apps/worker      Cloudflare Worker (Hono). /api 라우트, Queues 컨슈머(plan/image), R2, 만료 정리 cron, SPA 에셋
packages/shared  @gdm/shared — 도메인 상수, zod 스키마, 에러 코드. 웹·워커가 같은 계약을 쓴다
supabase/        마이그레이션 SQL (번호 순서대로 적용)
```

## 명령

```bash
pnpm install
pnpm dev              # web 5173 + worker 8787 (vite 가 /api 를 8787 로 프록시)
pnpm dev:worker       # worker 만. console 로그를 확실히 보려면 이걸 따로 띄운다
pnpm -r typecheck     # 세 패키지 타입체크 (worker 는 wrangler types 먼저 실행됨)
pnpm -r test          # vitest
pnpm format           # prettier --write
pnpm build            # web 빌드 → worker dry-run 번들
```

로컬 환경파일(커밋 금지): `apps/web/.env.local`(VITE_*), `apps/worker/.dev.vars`(SUPABASE_URL 포함 비밀값).
**wrangler.jsonc 는 로컬에서 수정하지 않는다.** .dev.vars 가 vars 를 덮어쓴다. 수정하면 git pull 이 충돌한다.

## 규칙

- 경계마다 zod 검증: 요청 본문, 서버 응답, 큐 메시지, 모델 출력 모두 `@gdm/shared` 스키마로 파싱한다.
- 상수·라벨·에러 코드는 `packages/shared` 에만 둔다. 화면 문구의 숫자(13장, 10MB 등)는 상수에서 가져온다.
- 에러는 코드 문자열로 주고받는다 (`ApiError(code, status)` ↔ 웹 `ApiRequestError`). 사용자 문구 매핑은 웹에서.
- Worker 는 service role 로 DB 에 접근하므로 모든 쿼리에 `user_id` 조건을 직접 건다.
- 이미지 실패 사유는 `job_sections.error_detail` 에 남기고 카드에 표시한다. 새 실패 경로를 추가하면 `note()`/`lastDetail` 로 기록할 것.
- OpenAI 호출 실패는 `classifyResponse()` 를 거쳐 kind(OPENAI_RATE_LIMIT 등)로 분류한다. 직접 status 를 해석하지 않는다.
- UI 문구는 한국어 구어체("…했어요"). 디자인 토큰은 `apps/web/src/styles/global.css` 의 `:root`.
- 커밋 전: `pnpm format && pnpm -r typecheck && pnpm -r test`. prettier 미적용 파일은 CI 대신 사람이 잡는다.
- 마이그레이션은 `supabase/migrations/2026MMDDHHMMSS_*.sql` 로 추가만 한다. 기존 파일은 수정하지 않는다.
- 비밀값·개인 연락처·API 키는 저장소에 넣지 않는다. Supabase publishable key 와 URL 은 공개값이라 괜찮다.

## 핵심 흐름 (요약)

POST /api/jobs(draft) → PUT inputs ×N(시그니처 검증 후 R2) → POST start(queued, 용량 예약, {kind:plan})
→ 컨슈머 plan: Vault 키 → Responses API(structured output, 1회 repair) → job_sections N행 → {kind:image}×N
→ 컨슈머 image: 게이트(감속·동시 5|10 슬롯, DB advisory lock) → images/edits → 원본 JSON R2 → status
→ 웹: Realtime(job_sections) + 7초 폴링 → /raw → JPEG 검증 → Canvas 카피 오버레이 → 미리보기/JPG/ZIP/합본

## 자주 겪는 문제

- `assets.directory does not exist`: web 이 빌드된 적 없음. dev 스크립트가 폴더를 만들어 준다. 안 되면 `pnpm --filter @gdm/web build`.
- `pnpm dev` 터미널에 Worker console 이 안 보임: 대부분 옛 코드가 도는 중. `git log -1 --oneline` 으로 커밋 확인 후 재시작. 그래도 안 보이면 `pnpm dev:worker` 를 따로 띄운다.
- `git pull` 거부(wrangler.jsonc): `git restore apps/worker/wrangler.jsonc` 또는 `git fetch && git reset --hard origin/<branch>` (추적 파일만 원격으로 맞춤, .env/.dev.vars 는 유지).
- 초기화: Supabase `delete from public.jobs;` + 로컬 `apps/worker/.wrangler/state` 삭제(pnpm dev 종료 후).
- 로컬 `wrangler dev` 에서는 cron 이 돌지 않는다. R2·Queues 는 로컬 시뮬레이션이다.
