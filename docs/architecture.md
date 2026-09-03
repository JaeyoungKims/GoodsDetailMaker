# 아키텍처 (자체 호스팅)

참고 사이트 역분석: [detail-page-studio-analysis.md](./reference/detail-page-studio-analysis.md) · 현황·백로그: [status.md](./status.md)

## 구성

```
apps/web         React 19 + Vite 7 + React Router 7 SPA. 쿠키 세션, /api 호출, SSE 구독, Canvas 합성·내보내기
apps/server      Node 22 + Hono 한 프로세스. /api 라우트, pg-boss 큐 컨슈머(plan/image), 로컬 디스크 저장,
                 Postgres LISTEN → SSE, 15분 정리 스케줄, 웹 dist 정적 서빙
packages/shared  도메인 상수, zod 스키마, 에러 코드 — 웹과 서버가 같은 계약을 쓴다
packages/ai      OpenAI 호출: 기획(structured output + repair), 이미지(edits), 프롬프트 재작성. 플랫폼 독립
```

## 데이터 흐름

```
브라우저 ── POST /api/auth/login ─────▶ sessions 행 + HttpOnly 쿠키
        ── POST /api/jobs ──────────▶ jobs(draft)
        ── PUT  /inputs/:id ×N ─────▶ 시그니처 검증 → DATA_DIR/users/<u>/jobs/<j>/inputs/*
        ── POST /start ─────────────▶ status=queued, pg-boss gdm-plan
                                        │
                              워커 plan ── AES 복호화한 키 → Responses API → job_sections N행 → gdm-image ×N
                              워커 image ─ 게이트(감속·슬롯) → (피드백 반영) → images/edits → raw/NN.json → status
브라우저 ◀── SSE /api/jobs/:id/events (job_sections 트리거 NOTIFY) ── 변화 시 GET /api/jobs/:id (+7초 폴링)
        ── GET /raw ────────────────▶ 디스크의 원본 JSON
        └─ 브라우저에서 JPEG 검증 → Canvas 카피 오버레이 → 미리보기 / JPG / ZIP / 세로 합본
```

## 인증

- `users(email, password_hash[scrypt], role)` · `sessions(id=토큰 해시, expires_at)` · `user_identities(provider, provider_user_id)`(소셜 로그인용, 추후)
- 첫 가입자가 admin. `ALLOW_SIGNUP=false` 로 가입 차단 가능.
- OpenAI 키는 `APP_SECRET` 파생 키로 AES-256-GCM 암호화해 `user_settings.openai_key_encrypted` 에 저장.

## 큐 (pg-boss)

| 큐          | 내용                                                      | 재시도                                                                    |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------- |
| gdm-plan    | 브리프 → N장 설계                                         | 우리 로직에서 처리(실패 시 job failed)                                    |
| gdm-image   | 섹션 1장 생성                                             | attempt(최대 5) / deferrals(게이트, 최대 60) 를 메시지에 실어 우리가 통제 |
| gdm-cleanup | 15분 크론: 만료 작업 삭제, 죽은 워커 복구, 만료 세션 삭제 | -                                                                         |

## 한도와 게이트

| 항목                       | 값                                          |
| -------------------------- | ------------------------------------------- |
| 진행 중 작업 / 24시간 작업 | 3 / 10 (초안 제외)                          |
| 입력 이미지                | 1~5장, 10MB, 합계 25MB, 재업로드 10회       |
| 저장 공간                  | 디스크가 곧 한도. 서비스 합계 1TB 상한만 둠 |
| 보관                       | `JOB_RETENTION_DAYS` (0=무제한)             |
| 동시 생성                  | 사용자 설정 5                               | 10, `claim_image_slot()` advisory lock |
| 감속                       | 429 의 retry-after 만큼 사용자 전체 대기    |

## 상태

- jobs.status: draft → queued → planning → generating → partial | completed | failed
- job_sections.status: queued → generating → completed | failed, 429 시 waiting_rate_limit
- 실패 사유·처리 경로는 `job_sections.error_detail` 에 남고 카드에 표시된다.
