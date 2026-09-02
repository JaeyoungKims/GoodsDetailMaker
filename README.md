# GoodsDetailMaker — 상세페이지 13장 제작실

상품 이미지와 정보를 한 번 입력하면 AI가 구매 퍼널 13단계를 기획하고, 각 단계를 1024×1536 이미지로
독립 생성하는 BYOK(사용자 본인 OpenAI 키) 도구입니다.

- 셋업 가이드(Supabase·Cloudflare·OpenAI): [docs/setup.md](docs/setup.md)
- 아키텍처: [docs/architecture.md](docs/architecture.md)
- 참고 사이트 역분석: [docs/reference/detail-page-studio-analysis.md](docs/reference/detail-page-studio-analysis.md)

## 스택

| 영역                      | 기술                                                           |
| ------------------------- | -------------------------------------------------------------- |
| 프론트                    | React 19, Vite 7, React Router 7, zod 4, supabase-js           |
| API / 큐 / 저장           | Cloudflare Workers (Hono), Queues, R2, 정적 에셋               |
| 인증 / DB / 실시간 / 비밀 | Supabase Auth(매직링크 + Turnstile), Postgres, Realtime, Vault |
| AI                        | OpenAI gpt-image-2 (이미지), Responses API (기획)              |

## 시작하기

```bash
pnpm install

# 1) Supabase: supabase/migrations 적용, supabase/README.md 의 Auth 설정
# 2) 웹 환경변수
cp .env.example apps/web/.env.local        # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
# 3) 워커 비밀
cp apps/worker/.dev.vars.example apps/worker/.dev.vars
#    SUPABASE_SERVICE_ROLE_KEY 등 채우기, wrangler.jsonc 의 SUPABASE_URL 수정

pnpm dev          # web(5173) + worker(8787) 동시 실행. /api 는 vite 가 8787 로 프록시
pnpm typecheck
pnpm test
pnpm build        # web 빌드 후 worker dry-run 번들
```

## 배포 (회원님 Cloudflare 계정에서 직접)

```bash
cd apps/worker
wrangler login                                   # 또는 CLOUDFLARE_API_TOKEN
wrangler r2 bucket create goods-detail-maker-artifacts
wrangler queues create goods-detail-maker-jobs
wrangler queues create goods-detail-maker-jobs-dlq
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put TURNSTILE_SECRET_KEY
cd ../.. && pnpm deploy
```

정적 에셋(`apps/web/dist`)과 API 가 한 Worker 로 배포됩니다.

## 폴더

```
apps/web         SPA
apps/worker      Worker (API, 큐, cron)
packages/shared  공용 스키마·상수
supabase         마이그레이션
docs             설계 문서
```
