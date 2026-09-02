# 아키텍처

참고 사이트 역분석: [detail-page-studio-analysis.md](./reference/detail-page-studio-analysis.md)

## 구성

```
apps/web        React 19 + Vite 7 + React Router 7 SPA. Supabase Auth 세션, /api 호출, Canvas 합성·내보내기
apps/worker     Cloudflare Worker (Hono). /api 라우트, Queues 컨슈머(plan/image), R2, 만료 정리 cron, SPA 에셋 서빙
packages/shared 도메인 상수, zod 스키마, 에러 코드 — 웹과 워커가 같은 계약을 쓴다
supabase        Postgres 마이그레이션 (jobs / job_inputs / job_sections / user_settings, RLS, Realtime, Vault 함수)
```

## 데이터 흐름

```
브라우저 ── POST /api/jobs ──────────▶ Worker ── insert jobs(draft)
        ── PUT  /inputs/:id ×N ─────▶ Worker ── R2 put + job_inputs
        ── POST /start ─────────────▶ Worker ── status=queued, Queue {kind:plan}
                                                  │
                                      Queue 컨슈머 ── plan: Vault 키 → OpenAI 기획 → job_sections 13행 → Queue {kind:image}×13
                                                  └─ image: gpt-image-2 → 원본 JSON → R2, job_sections.status
브라우저 ◀── Supabase Realtime(job_sections) ── 변화 시 GET /api/jobs/:id 재조회 (+7초 폴링)
        ── GET /raw ────────────────▶ Worker ── R2 원본 JSON
        └─ 브라우저에서 JPEG 검증 → Canvas 카피 오버레이 → 미리보기 / JPG / ZIP / 세로 합본
```

## 상태

- jobs.status: draft → queued → planning → generating → partial | completed | failed
- job_sections.status: queued → generating → completed | failed, 429 시 waiting_rate_limit
- 작업 상태는 섹션 상태에서 `deriveJobStatus` 로 재계산한다(웹·워커 동일 함수).

## 아직 골격만 있는 부분 (TODO)

| 영역          | 파일                                  | 내용                                                         |
| ------------- | ------------------------------------- | ------------------------------------------------------------ |
| 새 작업 폼    | apps/web/src/pages/NewJobPage.tsx     | 4개 카드 UI, 이미지 정규화, create→upload→start, 이어서 시도 |
| 진행 화면     | apps/web/src/pages/JobPage.tsx        | Realtime+폴링 훅, 섹션 카드 편집/재시도, 미리보기 캐시       |
| 합성/내보내기 | apps/web/src/features/compose, export | JPEG SOF 검증, Canvas 오버레이, ZIP, 세로 합본               |
| Turnstile     | apps/web/src/pages/LoginPage.tsx      | 위젯 렌더 + captchaToken                                     |
| 한도          | apps/worker/src/routes/jobs.ts        | 활성/일일 작업 수, 저장 용량 250MB/8GB                       |
| 동시성 게이트 | apps/worker/src/queue/image.ts        | 사용자별 5/10 동시 생성 제한                                 |
| 기획 프롬프트 | apps/worker/src/services/openai.ts    | 시스템 프롬프트 튜닝, 모델 선택                              |
