# GoodsDetailMaker — 프로젝트 안내 (Claude Code / 개발자용)

상품 사진·정보를 한 번 입력하면 AI가 구매 퍼널 N단계를 기획하고 각 단계를 1024×1536 이미지로 독립 생성하는
BYOK(사용자 본인 OpenAI 키) 상세페이지 도구. 한국어 UI. **집 PC(Windows) 한 대에서 자체 호스팅**한다.

- 현황·백로그: `docs/status.md` (먼저 읽을 것)
- 아키텍처: `docs/architecture.md` / 셋업: `docs/setup.md` / 참고 사이트 역분석: `docs/reference/`

## 구조

```
apps/web         React 19 + Vite 7 + React Router 7. 쿠키 세션 인증, /api 호출, SSE 구독, Canvas 카피 합성, ZIP·합본 내보내기
apps/server      Node 22 + Hono 한 프로세스. /api 라우트, pg-boss 큐 컨슈머(plan/image), 로컬 디스크 저장, SSE, 정리 스케줄, 웹 dist 서빙
packages/shared  @gdm/shared — 도메인 상수, zod 스키마, 에러 코드. 웹·서버가 같은 계약을 쓴다
packages/ai      @gdm/ai — OpenAI 호출 계층(기획 프롬프트·structured output·repair, 이미지 생성, 프롬프트 재작성). 플랫폼 독립
```

## 명령

```bash
pnpm install
pnpm dev              # web 5173 + server 8787 (vite 가 /api 를 8787 로 프록시)
pnpm dev:server       # 서버만 (tsx watch)
pnpm typecheck        # 전체 타입체크
pnpm test             # vitest
pnpm format           # prettier --write
pnpm build && pnpm start   # 운영 실행 (서버가 apps/web/dist 를 서빙)
pnpm migrate          # 마이그레이션만 적용 (서버 시작 시에도 자동)
```

서버 설정은 `apps/server/.env` (커밋 금지, 예시는 `.env.example`). 필수: DATABASE_URL, APP_SECRET(32자 이상), DATA_DIR.
웹은 개발 시 별도 환경변수가 없다 (`VITE_API_TARGET` 으로 프록시 대상만 바꿀 수 있음).

## 규칙

- 경계마다 zod 검증: 요청 본문, 서버 응답, 큐 메시지, 모델 출력 모두 `@gdm/shared` 스키마로 파싱한다.
- 상수·라벨·에러 코드는 `packages/shared` 에만 둔다. 화면 문구의 숫자(13장, 10MB 등)는 상수에서 가져온다.
- 에러는 코드 문자열로 주고받는다 (`ApiError(code, status)` ↔ 웹 `ApiRequestError`). 사용자 문구 매핑은 웹에서.
- 서버는 단일 DB 사용자로 접근하므로 모든 조회·갱신에 `user_id` 조건을 직접 건다 (요청 사용자 = 세션 사용자).
- 이미지 실패 사유는 `job_sections.error_detail` 에 남기고 카드에 표시한다. 새 실패 경로를 추가하면 `note()`/`lastDetail` 로 기록할 것.
- OpenAI 호출 실패는 `classifyResponse()` 를 거쳐 kind(OPENAI_RATE_LIMIT 등)로 분류한다. 직접 status 를 해석하지 않는다.
- UI 문구는 한국어 구어체("…했어요"). 디자인 토큰은 `apps/web/src/styles/global.css` 의 `:root`.
- 커밋 전: `pnpm format && pnpm -r typecheck && pnpm -r test`. prettier 미적용 파일은 CI 대신 사람이 잡는다.
- 마이그레이션은 `apps/server/src/db/migrations/NNNN_*.sql` 로 추가만 한다. 기존 파일은 수정하지 않는다. 서버 시작 시 자동 적용.
- 비밀값·개인 연락처·API 키는 저장소에 넣지 않는다.
- DB 접근은 postgres.js 태그드 템플릿(`sql\`...\``)으로만. 문자열 결합 금지. 부분 갱신은 `updateSection()` 화이트리스트를 쓴다.

## 핵심 흐름 (요약)

POST /api/auth/login(쿠키 세션) → POST /api/jobs(draft) → PUT inputs ×N(시그니처 검증 후 디스크) → POST start(queued, {kind:plan})
→ 워커 plan: 암호화된 키 복호화 → Responses API(structured output, 1회 repair) → job_sections N행 → {kind:image}×N
→ 워커 image: 게이트(감속·동시 5|10 슬롯, DB advisory lock) → 피드백 있으면 프롬프트 재작성 → images/edits → raw JSON 디스크 → status
→ 웹: SSE(/api/jobs/:id/events, Postgres NOTIFY) + 7초 폴링 → /raw → JPEG 검증 → Canvas 카피 오버레이 → 미리보기/JPG/ZIP/합본

## 자주 겪는 문제

- 서버가 바로 종료 + "설정이 올바르지 않습니다": `apps/server/.env` 의 DATABASE_URL / APP_SECRET 확인.
- `ECONNREFUSED :5432`: Postgres 서비스 꺼짐. Windows 서비스에서 postgresql-x64-16 시작.
- 웹 루트 404 "web build not found": `pnpm --filter @gdm/web build` 후 서버 재시작 (개발 중엔 5173 사용).
- 로그가 안 보이면 옛 코드가 도는 중인지 `git log -1 --oneline` 으로 확인. `pnpm dev:server` 를 따로 띄우면 서버 로그만 본다.
- 초기화: `drop database ...; create database ...;` + `DATA_DIR` 비우기. 작업만 지우려면 `delete from jobs` (cascade) + 해당 폴더 삭제.
- 검증용 Postgres 를 이 저장소 밖에서 띄우려면 `initdb` + `pg_ctl -o "-p 5433"` 후 DATABASE_URL 을 5433 으로.
