# 아키텍처

참고 사이트 역분석: [detail-page-studio-analysis.md](./reference/detail-page-studio-analysis.md) · 현황·백로그: [status.md](./status.md)

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

## 한도와 동시 생성 게이트

| 항목                | 값                                                   | 검사 위치                                            |
| ------------------- | ---------------------------------------------------- | ---------------------------------------------------- |
| 진행 중 작업 수     | 3                                                    | POST /api/jobs (`JOB_ACTIVE_LIMIT`)                  |
| 24시간 작업 생성 수 | 10                                                   | POST /api/jobs (`JOB_DAILY_LIMIT`)                   |
| 입력 이미지         | 1~5장, 10MB, 합계 25MB                               | PUT inputs                                           |
| 같은 입력 재업로드  | 10회                                                 | PUT inputs (`JOB_UPLOAD_ATTEMPT_LIMIT`)              |
| 저장 공간           | 사용자 250MB, 서비스 8GB                             | PUT inputs, POST start (`storage_usage()` RPC)       |
| 원본 응답 예약      | 시작 시 13 × 3MB                                     | POST start → jobs.reserved_bytes                     |
| 동시 생성           | 사용자 설정 5 또는 10                                | 큐 컨슈머 → `claim_image_slot()` RPC (advisory lock) |
| 자동 감속           | 429 의 retry-after 만큼 사용자 전체 대기             | user_settings.rate_limited_until                     |
| 게이트 지연         | 5→30초 점증, 최대 60회 후 `IMAGE_DISPATCH_EXHAUSTED` | 메시지 `deferrals` (attempt 와 별개)                 |
| 죽은 워커 복구      | 10분 넘게 generating → failed                        | cron 15분                                            |

## 기획 프롬프트 (apps/worker/src/services/planPrompt.ts)

- 시스템 프롬프트: 출력 계약(13개·index·role 슬롯·길이), 절대 규칙 5개(사실 날조 금지, 금지 표현, 사진 일치, 스타일 일관·구도 다양, 대체 규칙), 단계별 목표와 정보 없을 때의 대체 규칙, 스타일 8종 시각 방향, 카피 작법.
- 사용자 프롬프트: 브리프를 구조화하고 비어 있는 항목마다 대체 규칙을 붙인다. storyOrder 를 `i. 단계 → role 슬롯` 으로 나열해 두 축을 분리한다. 레거시 tone 은 새 tone 으로 매핑.
- 출력: Responses API structured output(strict JSON schema) → 공백·빈 불릿 정규화 → zod 검증. 실패하면 오류 목록을 붙여 같은 대화에서 1회 수정 요청, 그래도 실패하면 `IMAGE_RESPONSE_INVALID`.
- 모델: `PLAN_MODEL` 환경변수(기본 gpt-5-mini). 이미지는 `detail: "low"` 로 첨부해 토큰을 아낀다.

## 아직 골격만 있는 부분 (TODO)

| 영역        | 파일                            | 내용                                             |
| ----------- | ------------------------------- | ------------------------------------------------ |
| 정보 페이지 | apps/web/src/pages/InfoPage.tsx | 개인정보·이용조건·도움말 본문                    |
| E2E         | -                               | 실제 Supabase·Cloudflare 환경에서 생성 흐름 검증 |
