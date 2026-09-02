# 실제 환경 셋업 가이드

코드는 준비돼 있고, 아래 세 서비스에서 각각 만들어야 하는 것이 있습니다. 순서대로 진행하면 됩니다.
전부 회원님 계정에서 직접 하는 작업이고, 키·시크릿은 저장소에 넣지 않습니다.

| 순서 | 어디서     | 만드는 것                         | 얻는 값                                                |
| ---- | ---------- | --------------------------------- | ------------------------------------------------------ |
| 1    | Supabase   | 프로젝트, 마이그레이션, Auth 설정 | Project URL, publishable key, secret(service role) key |
| 2    | Cloudflare | Turnstile 위젯                    | Site Key, Secret Key                                   |
| 3    | Cloudflare | R2 버킷, Queue 2개, Worker 시크릿 | (wrangler 로 생성)                                     |
| 4    | OpenAI     | API 키 (사용자별)                 | sk-proj-…                                              |
| 5    | 로컬       | 환경파일 2개, 로컬 실행           | -                                                      |
| 6    | 배포       | `pnpm deploy`                     | `https://goods-detail-maker.<계정>.workers.dev`        |

---

## 1. Supabase

### 1-1. 프로젝트 만들기

1. https://supabase.com/dashboard → **New project**. 리전은 `Northeast Asia (Seoul)` 권장.
2. 생성 후 **Project Settings → API** 에서 아래를 메모합니다.
   - `Project URL` → `https://<ref>.supabase.co`
   - **Publishable key** (`sb_publishable_…`) → 브라우저용
   - **Secret key** (`sb_secret_…`) → Worker 전용. 절대 브라우저·저장소에 넣지 않습니다.
   - 구형 프로젝트라 `anon` / `service_role` JWT 만 보이면 그 값을 같은 용도로 씁니다.

### 1-2. 마이그레이션 적용

방법 A (대시보드): **SQL Editor** 에 아래 파일을 순서대로 붙여넣고 실행합니다.

1. `supabase/migrations/20260902000000_init.sql`
2. `supabase/migrations/20260902010000_limits_and_gate.sql`

방법 B (CLI):

```bash
npx supabase login
npx supabase link --project-ref <ref>
npx supabase db push
```

확인:

- **Database → Extensions** 에서 `supabase_vault` 가 켜져 있어야 합니다. (init.sql 이 켜지만, 실패했다면 수동으로 Enable)
- **Database → Publications → supabase_realtime** 에 `job_sections` 가 포함돼 있어야 합니다.
- **Database → Functions** 에 `set_openai_key`, `get_openai_key`, `delete_openai_key`, `storage_usage`, `claim_image_slot` 가 보여야 합니다.

### 1-3. Auth 설정

**Authentication → Providers → Email**

- Enable Email provider: 켬
- Confirm email: 끔 (매직링크만 사용)
- Secure email change 등은 기본값

**Authentication → URL Configuration**

- Site URL: 배포 주소 (`https://goods-detail-maker.<계정>.workers.dev`, 나중에 채워도 됨)
- Redirect URLs: `http://localhost:5173`, 배포 주소

**Authentication → Attack Protection**

- Enable Captcha protection: 켬
- Provider: **Turnstile**
- Secret key: 2단계에서 만든 Turnstile **Secret Key**

**Authentication → Rate Limits / SMTP** (중요)

- Supabase 기본 메일 발송은 시간당 몇 통 수준으로 제한됩니다. 실사용 전에는 **Project Settings → Auth → SMTP Settings** 에 자체 SMTP(예: Resend, SendGrid, Gmail 앱 비밀번호)를 연결하세요.

### 1-4. JWT 검증 방식

Worker 는 두 방식을 모두 지원합니다.

- 신규 프로젝트(비대칭 키): 아무 설정 없이 JWKS 로 검증합니다. **권장.**
- 구형 프로젝트(HS256): **Project Settings → API → JWT Secret** 값을 Worker 시크릿 `SUPABASE_JWT_SECRET` 으로 넣습니다.

---

## 2. Cloudflare Turnstile

1. https://dash.cloudflare.com → **Turnstile → Add widget**
2. Hostnames: `localhost`, `goods-detail-maker.<계정>.workers.dev` (커스텀 도메인이 있으면 함께)
3. Widget Mode: Managed
4. 생성 후 **Site Key** 와 **Secret Key** 를 메모합니다.
   - Site Key → 웹 `VITE_TURNSTILE_SITE_KEY`
   - Secret Key → Supabase Attack Protection (1-3) 과 Worker 시크릿 `TURNSTILE_SECRET_KEY`

개발 중에는 Site Key 에 테스트 키 `1x00000000000000000000AA` 를 써도 됩니다(항상 통과, dev 모드에서만 허용). 단 이 경우 Supabase 쪽 Captcha 는 잠시 꺼 두어야 로그인 메일이 발송됩니다.

---

## 3. Cloudflare Workers · R2 · Queues

### 3-1. 계정 준비

- Workers 는 무료 플랜으로 시작할 수 있습니다.
- **Queues** 는 플랜에 따라 사용 가능 여부·일일 한도가 다릅니다. 대시보드 **Workers & Pages → Queues** 에서 생성이 막히면 Workers Paid(월 $5) 로 올려야 합니다.
- **R2** 는 무료 한도(10GB 저장) 안에서 시작할 수 있고, 처음 한 번 결제 수단 등록을 요구할 수 있습니다.

### 3-2. 리소스 생성

```bash
cd apps/worker
npx wrangler login

npx wrangler r2 bucket create goods-detail-maker-artifacts
npx wrangler queues create goods-detail-maker-jobs
npx wrangler queues create goods-detail-maker-jobs-dlq
```

이름은 `wrangler.jsonc` 와 같아야 합니다. 바꾸고 싶으면 파일도 같이 수정합니다.

### 3-3. 공개 설정값

`apps/worker/wrangler.jsonc` 의 `vars`:

- `SUPABASE_URL`: `https://<ref>.supabase.co` 로 교체
- `APP_ENV`: 배포 시 `"production"` 으로
- `PLAN_MODEL`: 기획 모델. 기본 `gpt-5-mini`
- `IMAGE_GENERATION_ENABLED`: 이미지 생성을 잠시 막고 싶을 때 `"false"`

### 3-4. 시크릿

```bash
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # sb_secret_… (또는 service_role JWT)
npx wrangler secret put TURNSTILE_SECRET_KEY        # Turnstile Secret Key
npx wrangler secret put SUPABASE_JWT_SECRET         # 구형 HS256 프로젝트만
```

---

## 4. OpenAI

이 서비스는 BYOK 라서 **운영자 키가 필요 없습니다.** 사용자 각자가 자기 키를 화면의 설정에서 저장합니다.

사용자에게 안내할 내용:

1. https://platform.openai.com → API keys → Create new secret key (프로젝트 키 `sk-proj-…`)
2. 결제 수단 등록과 크레딧 충전
3. 이미지 모델(gpt-image 계열)은 조직 인증(Organization verification)이 요구될 수 있습니다. 설정 → Organization 에서 확인
4. 신규 계정은 분당 이미지 요청 한도가 낮으므로 생성 속도를 **가성비(동시 5개)** 로 시작

테스트용으로는 회원님 본인의 키 하나면 충분합니다.

---

## 5. 로컬 실행

### 5-1. 환경 파일

```bash
# 웹 (브라우저에 노출되는 값만)
cat > apps/web/.env.local <<'ENV'
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_…
VITE_TURNSTILE_SITE_KEY=0x4AAAAAA…
ENV

# 워커 (비밀값)
cat > apps/worker/.dev.vars <<'ENV'
SUPABASE_SERVICE_ROLE_KEY=sb_secret_…
TURNSTILE_SECRET_KEY=0x4AAAAAA…
SUPABASE_JWT_SECRET=
ENV
```

두 파일 모두 `.gitignore` 에 있어 커밋되지 않습니다.

### 5-2. 폰트

`apps/web/public/fonts/NotoSansKR-Variable.woff2` 를 넣습니다 (Google Fonts 에서 받은 variable woff2). 없어도 동작하지만 합성 결과 폰트가 시스템 폰트로 바뀝니다.

### 5-3. 실행

```bash
pnpm install
pnpm dev
```

- 웹: http://localhost:5173 (`/api` 는 8787 로 프록시)
- 워커: http://localhost:8787/api/health 가 `{ ok: true }` 를 돌려주면 정상
- `wrangler dev` 는 R2·Queues 를 로컬로 흉내 냅니다. 큐 컨슈머도 같은 프로세스에서 돕니다.

### 5-4. 첫 작업 돌려보기 (체크리스트)

1. 로그인 → 이메일로 온 링크 클릭 → 대시보드가 보이면 Auth OK
2. 설정에서 OpenAI 키 저장 → "••••abcd" 가 보이면 Vault OK
3. 새 상세페이지 → 사진 1장 + 스타일 선택 → 13장 생성 시작
4. 진행 화면에서 "기획하고 있어요" → 1~2분 뒤 13장 카드가 생기면 기획 OK
5. 카드가 하나씩 "완료" 로 바뀌고 미리보기가 뜨면 이미지·R2·합성 OK
6. 카피를 고쳐 저장 → 미리보기가 즉시 갱신되면 카피 편집 OK
7. ZIP 다운로드

막히는 곳별 확인 위치:

- 로그인 메일이 안 옴 → Supabase Auth Logs, SMTP 한도
- 키 저장 실패 → Supabase Logs → Postgres, `vault` 확장
- 기획에서 멈춤 → `npx wrangler tail` 로 Worker 로그, OpenAI 키 권한
- 이미지가 전부 실패 → 카드의 오류 문구 (API 키 / 한도 / 요청 거부)

---

## 6. 배포

```bash
# 루트에서
pnpm build            # web 빌드 → apps/web/dist, worker dry-run
pnpm deploy           # apps/web/dist 를 정적 에셋으로 포함해 Worker 배포
```

배포 주소: `https://goods-detail-maker.<계정>.workers.dev`

배포 후:

1. Supabase **URL Configuration** 의 Site URL / Redirect URLs 에 배포 주소 추가
2. Turnstile 위젯 Hostnames 에 배포 주소 추가
3. `https://…/api/health` 확인 → 로그인 → 위 체크리스트 반복

웹 빌드는 `.env.local` 의 `VITE_*` 값을 **빌드 시점**에 넣습니다. 값이 바뀌면 다시 `pnpm build && pnpm deploy`.

### 커스텀 도메인 (선택)

Cloudflare 대시보드 → Workers → goods-detail-maker → Settings → Domains & Routes 에서 도메인을 붙이고, Supabase·Turnstile 에도 같은 도메인을 추가합니다.

---

## 7. 운영 시 확인할 것

| 항목        | 위치                                                                     |
| ----------- | ------------------------------------------------------------------------ |
| Worker 로그 | `npx wrangler tail` 또는 대시보드 Observability                          |
| 큐 적체·DLQ | 대시보드 Queues → goods-detail-maker-jobs / -dlq                         |
| R2 사용량   | 대시보드 R2 → 버킷 → Metrics                                             |
| DB 사용량   | Supabase → Reports                                                       |
| 만료 정리   | 15분 크론 (`triggers.crons`). 대시보드 Workers → Triggers 에서 실행 이력 |
| 이메일 한도 | Supabase Auth → Rate Limits, 자체 SMTP 권장                              |
| 문의 채널   | `apps/web/src/pages/InfoPage.tsx` help → 운영 문의 절에 기입             |
