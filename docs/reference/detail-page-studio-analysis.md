# 상세페이지 13장 제작실 (Detail Page Studio) 역분석 보고서

- 대상: https://detail-page-studio.sky-rane.workers.dev/
- 분석 자료: `index.html`, `assets/index-DgxifDUn.js`(Vite 번들, 약 627KB), `assets/index-qCUIinYG.css`
- 작성일: 2026-09-02
- 목적: GoodsDetailMaker 재구축을 위한 요구사항·아키텍처 기준선

> 백엔드(Workers API, 큐 컨슈머, 기획 프롬프트) 소스는 배포 번들에 포함되지 않는다.
> 아래 백엔드 관련 내용은 프론트 코드의 API 호출, zod 스키마, 에러 코드, 안내 페이지 문구에서 **추론**한 것이다.

---

## 1. 제품 한 줄 정의

상품 이미지 1~5장과 선택 정보를 한 번 입력하면, AI가 구매 퍼널 13단계를 기획하고
각 단계를 **1024×1536 세로 이미지 13장으로 독립 생성**하는 BYOK(사용자 본인 OpenAI 키) 도구.
결과는 개별 JPG, ZIP, 세로 합본 JPG로 내려받는다.

핵심 차별점:
1. 긴 콜라주 한 장이 아니라 역할이 다른 완성 이미지 13장을 각각 만든다.
2. 실패하거나 마음에 안 드는 장만 골라 다시 만든다.
3. 한글 카피는 기본적으로 **브라우저 Canvas에서 오버레이**하므로 문구 수정에 이미지 비용이 들지 않는다.
4. 운영자는 AI 비용을 부담하지 않는다(BYOK). 서버는 Cloudflare/Supabase 무료 한도에서 시작.

---

## 2. 기술 스택

| 영역 | 확인된 기술 | 근거 |
|---|---|---|
| 프론트 | React + React Router v7.18.1 + Vite, zod v4 | 번들 내 라이선스 주석, `H("ZodString")` 패턴 |
| 폰트 | Noto Sans KR Variable (self-host `/fonts/`) | CSS `@font-face` |
| 인증 | Supabase Auth 매직링크(OTP 이메일) + Cloudflare Turnstile | `signInWithOtp({captchaToken})` |
| DB/실시간 | Supabase Postgres, Realtime `postgres_changes` on `public.job_sections` | 채널 `job-{jobId}` |
| 비밀 저장 | Supabase Vault (OpenAI 키 암호화) | 개인정보 안내 페이지 |
| API/호스팅 | Cloudflare Workers (`/api/*`, 정적 에셋) | 도메인, 안내 페이지 |
| 큐 | Cloudflare Queues | 메시지 스키마 `{kind:"plan"|"image"}`, 에러코드 `QUEUE_UNAVAILABLE` |
| 스토리지 | Cloudflare R2 (입력 이미지, 원본 응답 JSON) | 안내 페이지, `INPUT_OBJECT_MISSING` |
| 이미지 AI | OpenAI `gpt-image-2`, 1024×1536, quality medium | 도움말 링크, 요약 카드 |
| 기획 AI | OpenAI 텍스트 모델(모델명 미노출) | "기획 1회 + 이미지 13개" |

공개 값(비밀 아님): Supabase URL `https://nejwvxjnuonwdyadycpl.supabase.co`, publishable key, Turnstile site key.

---

## 3. 화면(라우트) 구성

| 경로 | 화면 | 비고 |
|---|---|---|
| `/` (비로그인) | 로그인 | 이메일 + Turnstile → 매직링크 발송 |
| `/` (로그인) | 대시보드 | 버튼 2개: 새 상세페이지, API 키 설정 |
| `/new` | 새 상세페이지 폼 | 4개 카드 + 우측 고정 요약 카드 |
| `/jobs/:jobId` | 진행/결과 | 13장 카드, 실시간 진행, 카피 편집, 다운로드 |
| `/settings` | 설정 | OpenAI 키 저장/삭제, 동시 생성 수 5/10 |
| `/about` `/help` `/privacy` `/terms` | 정보 페이지 | 비로그인 접근 가능 |
| `*` | `/`로 리다이렉트 | |

공통 푸터: 소개 / 도움말 / 개인정보 / 이용 조건 / API 키 설정.

### 3.1 새 상세페이지 폼 (`/new`)

**카드 01 PRODUCT BRIEF** (이미지만 필수)
| 필드 | name | 제한 | 비고 |
|---|---|---|---|
| 상품명 | productName | ≤80 | 선택 |
| 카테고리 | category | ≤80 | 선택 |
| 주요 고객 | targetCustomer | ≤240 | 비우면 사진 기반 보수적 기획 |
| 핵심 장점 | coreBenefits | 줄당 1개, ≤5개, 각 ≤120 | |

**카드 02 CLAIM & STYLE**
| 필드 | name | 제한 |
|---|---|---|
| 장점 근거 | evidence | ≤8개, 각 ≤200 |
| 금지 표현 | prohibitedClaims | ≤10개, 각 ≤120 |
| 스타일(tone) | tone | 8종 select + 무드 프리뷰 |
| 추가 메모 | additionalNotes | ≤1000 |

스타일 8종: `warm_lifestyle`(기본), `cinematic`, `sporty`, `premium_luxury`, `clean_minimal`, `tech_future`, `natural_organic`, `bold_pop`.
레거시 호환값: `premium`, `friendly`, `minimal`, `energetic`.

**카드 03 REFERENCE IMAGE**
- 1~5장, JPG/PNG/WebP, 장당 10MB, 합계 25MB.
- 첫 번째가 "주력 제품". 목록에서 "주력으로" 버튼으로 순서 변경.
- 업로드 전 브라우저에서 정규화: EXIF 회전 반영 → 최대 2048px 리사이즈 → 흰 배경 JPEG 0.92 → `{원본명}.jpg`.

**카드 04 STORY FLOW** (설득 순서 13단계, 드래그/↑↓로 재배열, "추천 순서로" 리셋)

| 기본순서 | 키 | 라벨 | 설명 |
|---|---|---|---|
| 1 | HERO | 후킹멘트 | 핵심 소구점 하나와 제품 전체 모습을 각인 |
| 2 | PROBLEM | 공감대 유발 | 고객이 실생활에서 겪는 불편·욕구 구체화 |
| 3 | GAP | 핵심 장점 1 | 첫 번째 장점을 제품이 만드는 변화로 증명 |
| 4 | GUIDE | 핵심 장점 2 | 두 번째 장점을 다른 생활 장면과 근거로 증명 |
| 5 | CORE_REASON | 핵심 장점 3 | 세 번째 장점을 한 메시지로 깊게 증명 |
| 6 | PLAN | 이 제품을 써야 하는 이유 | 구조·기능·디테일로 선택 이유 납득 |
| 7 | OFFER | 가격·손실 회피 | 확인된 가격·할인만 사용, 미룰 비용 상기 |
| 8 | SUCCESS | 실제 후기 | 제공된 실제 후기만 사용 |
| 9 | LOSS | 비교·선택 근거 | 근거 있는 비교표/체크리스트 |
| 10 | CLOSING | 증정 혜택 | 실제 증정품이 있을 때만 |
| 11 | SITUATIONS | 실제 사용 상황 | 문제 해결 장면 다양하게 |
| 12 | BENEFIT_ARCHIVE | 혜택 총정리 | 앞서 증명한 혜택 요약 |
| 13 | PRODUCT_INFO | 제품 정보 | 구성·규격·사용 안내 |

**우측 요약 카드**: 13프레임 미니 프리뷰, 이미지 규격 1024×1536, 품질 가성비·Medium, 각 장 독립 처리, 문구 포함 완성 13장, 비용 청구 내 OpenAI 계정. 버튼 문구는 상태별로 "13장 생성 시작 / 처리 중… / 이어서 시도 / 생성 요청 완료".

### 3.2 진행/결과 화면 (`/jobs/:jobId`)

- 헤더: 상품명, 완료/실패/진행 카운트, 13칸 진행바(상태별 색), 설득 흐름 13칸(스토리 라벨 + 상태).
- `sections.length === 0`이면 "13단계 전환 퍼널을 기획하고 있어요" 플래닝 카드.
- 내보내기 패널: `13장 ZIP 다운로드`, `세로 합본 JPG 다운로드`. 13장 모두 completed이고 현재 카피 버전의 미리보기가 캐시되어 있어야 활성화.
- 섹션 카드 13개: 번호, 스테이지 라벨, headline, 상태 배지, 미리보기(2:3), 편집 폼(큰 제목 ≤28 / 보조 문구 ≤52 / 핵심 문구 줄당 하나 ≤3개×30자), 카피 저장, 실패 시 "이 장만 다시 만들기", 완료 시 "수정 문구로 이 이미지 다시 만들기"(비용 경고 confirm).
- 기능 플래그 `imageGenerationEnabled=false`면 "생성 기능이 아직 켜지지 않았어요" 안내. 카피 편집은 즉시 저장, 재생성 요청은 보관 후 나중 처리.
- 실시간 연결 실패 시 "자동으로 다시 확인" 안내 + 7초 폴링.

### 3.3 설정 (`/settings`)

- OpenAI API 키: password 입력 → PUT → 응답 `lastFour`만 표시("••••abcd"). 삭제는 confirm 후 DELETE.
- 이미지 생성 속도: `imageParallelism` 5(가성비, 신규 계정 권장) 또는 10(고속). 10칸 시각화. "OpenAI가 속도를 제한하면 잠깐 자동 감속".

---

## 4. 도메인 모델 (zod 스키마에서 복원)

### 4.1 ProductBrief (POST /api/jobs body)
```ts
{
  productName: string(≤80, default ""),
  category: string(≤80, default ""),
  targetCustomer: string(≤240, default ""),
  coreBenefits: string(1..120)[] (≤5),
  evidence: string(1..200)[] (≤8),
  tone: Tone,                          // 8종 + 레거시 4종
  prohibitedClaims: string(1..120)[] (≤10),
  additionalNotes: string(≤1000),
  storyOrder: StoryStage[13]           // 13개 전부, 중복 없음
}
```

### 4.2 Section (기획 결과 = 이미지 한 장의 설계)
```ts
{
  index: 1..13,
  role: "HERO"|"PROBLEM"|"SOLUTION"|"BENEFIT_A"|"BENEFIT_B"|"DETAIL"|"USAGE"
       |"TRUST"|"COMPARISON"|"CTA"|"REVIEW"|"GIFT"|"PRODUCT_INFO",  // 슬롯 고정, index 순서와 1:1
  headline: string(1..28),
  subheadline: string(≤52),
  bullets: string(1..30)[] (≤3),
  visualDirection: string(1..500),     // 디자인 시스템 설명
  imagePrompt: string(20..4000),       // 이미지 모델 프롬프트
  copyPlacement: "top"|"center"|"bottom",
  renderMode: "browser_overlay"|"image_model_text",  // 기본 browser_overlay
  status: "queued"|"waiting_rate_limit"|"generating"|"completed"|"failed",
  errorCode: SectionErrorCode|null,
  copyVersion: int ≥1                  // 낙관적 동시성
}
```
규칙: `image_model_text` 섹션은 모두 **동일한 visualDirection**을 공유해야 한다(디자인 시스템 일관성).
섹션 수는 13 또는 10(레거시)만 허용.

주의: 스토리 순서(`storyOrder`, 사용자 재배열 가능)와 섹션 role(`_t`, 고정 슬롯)은 **별개 축**이다.
화면 라벨은 `storyOrder[index-1]`로 표시하고, role은 기획 모델에게 주는 구조적 역할이다.

### 4.3 Job
```ts
{
  jobId: uuid,               // 클라이언트가 생성(crypto.randomUUID), Idempotency-Key로도 사용
  productName: string,
  status: "draft"|"queued"|"planning"|"generating"|"partial"|"completed"|"failed",
  storyOrder: StoryStage[13],
  sections: Section[0|10|13],
  imageGenerationEnabled: boolean
}
```
Job 상태 계산(클라이언트 측 낙관 갱신): 전부 completed → completed, 전부 failed → failed, 전부 끝났는데 섞임 → partial, 아니면 generating.

### 4.4 큐 메시지
```ts
{ kind: "plan",  userId, jobId }
{ kind: "image", userId, jobId, sectionIndex: 1..13, attempt: 1..5 }
```

### 4.5 Realtime 행 (job_sections)
```ts
{ job_id, user_id, section_index, status }
```

---

## 5. API 명세 (프론트 호출 기준, 모두 `Authorization: Bearer <Supabase JWT>`)

| Method | Path | 요청 | 응답 | 비고 |
|---|---|---|---|---|
| POST | `/api/jobs` | JSON ProductBrief, `Idempotency-Key: <jobId>` | `{id}` (== jobId) | 초안 생성 |
| PUT | `/api/jobs/:id/inputs/:inputId` | body=JPEG, `Content-Type`, `x-file-size` | `{stored:true}` | 이미지 1개씩 순차 업로드 |
| POST | `/api/jobs/:id/start` | - | `{queued:true}` | plan 메시지 enqueue |
| GET | `/api/jobs/:id` | - | Job | 폴링/실시간 후 재조회 |
| POST | `/api/jobs/:id/sections/:n/retry` | - | `{queued:true, sectionIndex, imageGenerationEnabled}` | 수동 재시도 |
| PATCH | `/api/jobs/:id/sections/:n/copy` | `{expectedCopyVersion, headline, subheadline, bullets}` | `{updated:true, section}` / 409 `{error:"COPY_VERSION_CONFLICT", currentCopyVersion}` | copyVersion +1 |
| GET | `/api/jobs/:id/sections/:n/raw` | - | OpenAI 원본 JSON `{data:[{b64_json}]}` (≤12MB) | R2 프록시 |
| PUT | `/api/settings/openai-key` | `{key}` | `{stored:true, lastFour}` | Vault 저장 |
| DELETE | `/api/settings/openai-key` | - | 204 | |
| GET/PUT | `/api/settings/image-speed` | `{imageParallelism: 5|10}` | `{imageParallelism}` | |
| ? | `/api/broadcast` | - | - | 번들에 문자열만 존재, 용도 미확인 |

### 5.1 서버 에러 코드 (프론트가 인식하는 것)
`INVALID_PRODUCT_BRIEF, JOB_ACTIVE_LIMIT, JOB_DAILY_LIMIT, JOB_CREATE_CONFLICT, API_KEY_REQUIRED, PRODUCT_IMAGE_REQUIRED, JOB_NOT_STARTABLE, JOB_NOT_UPLOADABLE, JOB_INPUT_LIMIT, JOB_INPUT_BYTES_LIMIT, STORAGE_QUOTA_LIMIT, JOB_INPUT_CONFLICT, JOB_UPLOAD_IN_PROGRESS, JOB_UPLOAD_ATTEMPT_LIMIT, INVALID_IMAGE, QUEUE_UNAVAILABLE, ARTIFACT_NOT_FOUND, JOB_NOT_FOUND, JOB_EXPIRED, SECTION_NOT_RETRYABLE, SECTION_MANUAL_RETRY_LIMIT`

### 5.2 섹션 실패 코드
`API_KEY_REQUIRED, OPENAI_API_KEY_INVALID, IMAGE_REQUEST_REJECTED, INPUT_METADATA_INVALID, INPUT_AGGREGATE_TOO_LARGE, INPUT_OBJECT_MISSING, INPUT_OBJECT_INVALID, IMAGE_CONFIG_INVALID, OPENAI_RATE_LIMIT, OPENAI_PROVIDER_FAILED, IMAGE_TIMEOUT, IMAGE_NETWORK_FAILED, IMAGE_RESPONSE_INVALID, IMAGE_RESPONSE_TOO_LARGE, IMAGE_RESPONSE_TIMEOUT, STORAGE_FAILED, VAULT_UNAVAILABLE, IMAGE_WORKER_FAILED, IMAGE_ATTEMPT_LIMIT, IMAGE_CONSUMER_RETRY_EXHAUSTED, IMAGE_DISPATCH_EXHAUSTED`

사용자 메시지 매핑: 키 문제 → "API 키 설정 확인", `OPENAI_RATE_LIMIT` → "요청이 몰려 잠시 멈춤", `INPUT_*` → "상품 이미지 처리 실패", 시도 소진 3종 → "자동 시도를 마쳤어요. 이 장만 다시 만들 수 있습니다", 그 외 → "이 장만 다시 시도".

---

## 6. 처리 흐름

```
[브라우저]                         [Workers API]            [Queue 컨슈머]              [외부]
 폼 제출
  ├─ zod 검증, 이미지 정규화
  ├─ POST /api/jobs (draft) ───────▶ jobs insert
  ├─ PUT inputs/:id ×N ────────────▶ R2 put (정규화 JPEG)
  └─ POST start ───────────────────▶ status=queued ─────▶ {kind:plan}
                                                          ├─ 입력 이미지 + brief로 기획 ──▶ OpenAI 텍스트
                                                          ├─ job_sections 13행 insert (queued)
                                                          └─ {kind:image}×13 (병렬 5|10)
                                                             ├─ gpt-image-2 1024×1536 ─▶ OpenAI 이미지
                                                             ├─ 원본 JSON → R2
                                                             └─ job_sections.status 갱신
 Supabase Realtime(job_sections) ◀───────────────────────── postgres_changes
  └─ 변화 감지 시 GET /api/jobs/:id 재조회 (+7초 폴링 백업)
 completed 섹션마다
  ├─ GET raw → b64 디코드 → JPEG SOF 검사(1024×1536)
  ├─ browser_overlay면 Canvas 합성(그라디언트 + Noto Sans KR 카피)
  └─ Blob 캐시(copyVersion 기준) → 미리보기/다운로드
```

### 6.1 카피 오버레이 렌더링 규칙 (Canvas, 클라이언트)
- 캔버스 1024×1536. 카피 영역 높이 720px, 좌우 여백 80px, 텍스트 폭 864px(불릿은 -36px).
- `copyPlacement`에 따라 영역을 상/중/하에 배치. 영역 위에 검정 그라디언트(top: 0.80→0.58→0.08, bottom 반대, center 0.18→0.76→0.18).
- 헤드라인 700/72px, 서브 400/36px(gap 24), 불릿 400/30px(첫 gap 30, 이후 10), 줄간 1.3.
- 텍스트가 넘치면 스케일을 1.8%씩 최대 36단계 줄여서 맞춤(최소 18px). 그래도 안 맞으면 `COPY_LAYOUT_FAILED`.
- 줄바꿈은 `Intl.Segmenter("ko", grapheme)` 기준 글자 단위 폭 측정.
- 흰 글자, 그림자 blur 8 / offsetY 2. 불릿은 "•" 글리프.
- 폰트는 `document.fonts.load`로 Noto Sans KR 로드 확인, 실패 시 `FONT_UNAVAILABLE`.
- 출력 JPEG 품질 0.9.
- 미리보기 합성 동시 실행 수 2.

`image_model_text` 모드는 이미지 모델이 글자를 직접 그리므로 원본 그대로 사용하고, 문구 수정은 "다시 만들기"로만 반영.

### 6.2 내보내기
- 파일명: `{상품명 slug(≤48)}-{jobId 끝 8자}-{NN}-{role}.jpg`, ZIP은 `…-13장.zip`, 합본은 `…-세로합본.jpg`.
- 다운로드 전 JPEG 시그니처(FFD8FF … FFD9)와 크기(장당 ≤20MB, 합계 ≤156MB) 검증.
- ZIP/세로합본 로직은 지연 로드 청크(`export-zip-*.js`, `export-vertical-*.js`)로 분리. 이번 분석 자료에는 미포함.
- 내보내는 동안 카피가 바뀌면 `EXPORT_SNAPSHOT_STALE`로 중단.

### 6.3 동시성·정합성 장치
- Job 생성은 클라이언트 UUID를 Idempotency-Key로 사용, 중간 실패 시 같은 jobId로 "이어서 시도"(업로드 완료 인덱스 기억).
- 카피 편집은 `expectedCopyVersion` 기반 낙관적 잠금. 다른 탭에서 수정되면 "다른 곳에서 카피가 수정됐어요" 표시하고 로컬 입력 유지.
- 미리보기 Blob 캐시는 `(jobId, index, copyVersion)` 키. 버전 불일치 시 폐기.
- 재시도 버튼/저장 버튼은 ref 플래그로 중복 클릭 방지.

---

## 7. 운영 정책·한도 (안내 페이지 기준)

| 항목 | 값 |
|---|---|
| 입력 이미지 | 1~5장, 장당 10MB, 합계 25MB |
| 사용자 저장 공간 | 250MB |
| 서비스 전체 저장 공간 | 8GB |
| 보관 기간 | 초안·작업·이미지 24시간, 이후 10~15분 내 자동 삭제 |
| 이미지 재시도 | 자동 최대 5회(attempt 1..5), 수동 재시도 횟수 제한 있음 |
| 동시 생성 | 사용자 설정 5 또는 10, 429 시 자동 감속 |
| 활성 작업/일일 작업 | 제한 있음(`JOB_ACTIVE_LIMIT`, `JOB_DAILY_LIMIT`, 수치 미노출) |
| 비용 | OpenAI 사용료 전액 사용자 부담, 재시도 비용도 포함 |
| 금지 | 근거 없는 의료 효능, 미취득 인증, 조작 후기, 미확인 수치·비교 |

기획 단계 가드레일(스토리 설명 문구에서 확인): 확인된 가격·할인만, 제공된 실제 후기만, 실제 증정품이 있을 때만. 후기 장에 "편집용 후기 초안" 표식이 있으면 UI에서 "가상 고객 이름과 후기 문구는 편집용 초안" 경고를 띄운다.

---

## 8. 디자인 시스템 요약

- 톤: 크림 배경 `#f6f3ec`, 딥 그린 `#163f2b`, 앰버 `#ce8c2d`/`#edbd66`, 잉크 `#172019`.
- 타이포: Noto Sans KR, 헤드라인 letter-spacing -0.065em, 굵기 800~900.
- 큰 워터마크 "13" 장식(대시보드, 작업 헤더).
- 카드 radius 26~28px, 그림자 `0 18px 55px rgba(29,46,34,.09)`.
- 스타일 프리뷰는 CSS 변수(`--mood-1..3`, `--mood-ink`, `--mood-accent`)로 8종 무드 전환.
- 반응형 브레이크포인트 980 / 900 / 760 / 720 / 640 / 560 / 520px.
- 접근성: `aria-label`, `role=status`, `aria-live`, focus-visible 아웃라인 `#ef9f32`, `data-testid="section-N"`.

---

## 9. 재구축 시 참고할 설계 판단

1. **기획 1회 + 이미지 N회 분리**: 기획 실패와 이미지 실패를 분리해 비용을 아끼고 부분 재시도가 가능하다.
2. **텍스트를 이미지 모델에 맡기지 않는 기본값**: 한글 렌더링 품질과 수정 비용 문제를 브라우저 오버레이로 회피. 필요한 장만 `image_model_text`로 예외 처리.
3. **원본 응답 JSON을 그대로 저장**: 서버는 합성하지 않고 R2에 원본만 두어 Workers CPU 시간·비용 최소화. 합성·ZIP·합본은 전부 클라이언트.
4. **Supabase Realtime + 폴링 이중화**: 실시간이 끊겨도 7초 폴링으로 복구.
5. **모든 경계에서 zod 검증**: 서버 응답도 파싱해서 스키마 불일치는 `JOB_RESPONSE_INVALID`로 처리.
6. **비용 경고 UX**: 이미지 API를 다시 호출하는 모든 버튼에 비용 발생 문구와 confirm.
7. **BYOK + Vault**: 키는 서버에서만 사용, 화면에는 마지막 4자리만.

## 10. 이번 분석에서 확인하지 못한 것

- 기획(planning) 프롬프트 본문과 텍스트 모델명.
- 이미지 프롬프트에 입력 이미지를 어떻게 첨부하는지(edits API vs generations API).
- 큐 컨슈머의 재시도/백오프 수치, 레이트리밋 감속 알고리즘.
- DB 스키마 전체(jobs, job_sections, job_inputs, settings 등 추정).
- `/api/broadcast`의 용도.
- ZIP/세로합본 청크의 구현(라이브러리, 합본 규격).
