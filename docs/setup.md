# 자체 호스팅 셋업 가이드 (Windows PC + Postgres)

집 PC 한 대에서 전부 돌아갑니다. 필요한 것은 Node 22, pnpm, Postgres 16, OpenAI 키(사용자별)뿐입니다.
Cloudflare·Supabase 계정은 더 이상 필요 없습니다.

## 1. 준비물 확인

```powershell
node -v      # v22 이상
pnpm -v      # 10 이상 (없으면: corepack enable; corepack prepare pnpm@10.33.0 --activate)
psql --version   # 16 (설치 시 정한 postgres 비밀번호를 기억해 두세요)
```

## 2. 데이터베이스 만들기 (한 번만)

pgAdmin 또는 psql 에서:

```sql
create database goods_detail_maker;
```

테이블은 서버가 처음 뜰 때 자동으로 만듭니다(`apps/server/src/db/migrations/`).

## 3. 서버 설정 파일

`apps/server/.env.example` 을 `apps/server/.env` 로 복사하고 채웁니다.

```
DATABASE_URL=postgres://postgres:비밀번호@localhost:5432/goods_detail_maker
DATA_DIR=D:/GoodsDetailMaker/data        # 사진·결과 저장 폴더. 용량 넉넉한 드라이브
APP_SECRET=<아래 명령으로 만든 값>
PORT=8787
JOB_RETENTION_DAYS=0                     # 0 = 무제한 보관
ALLOW_SIGNUP=true                        # 첫 계정(관리자) 만든 뒤 false 로 바꿔도 됨
```

APP_SECRET 생성:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

이 값은 OpenAI 키 암호화와 세션에 쓰입니다. 바꾸면 저장된 키를 다시 넣어야 하니 백업해 두세요.

## 4. 설치와 실행

```powershell
pnpm install
pnpm build          # 웹 빌드 + 서버 타입검사
pnpm start          # http://localhost:8787
```

서버는 번들 없이 `tsx` 로 TypeScript 를 그대로 실행합니다. `pnpm install` 로 devDependencies 까지 설치돼 있어야 합니다.

개발 중에는 `pnpm dev` (웹 5173 + 서버 8787, 웹이 /api 를 서버로 프록시).

첫 접속에서 "계정 만들기"로 가입하면 그 계정이 관리자가 됩니다. 이후 설정 → OpenAI 키 저장 → 새 상세페이지.

## 5. PC 부팅 시 자동 시작 (선택)

작업 스케줄러 → 기본 작업 만들기 → 트리거 "로그온할 때" → 동작 "프로그램 시작":

- 프로그램: `pnpm.cmd` (전체 경로는 PowerShell 에서 `where.exe pnpm` 으로 확인)
- 인수: `start`
- 시작 위치: 프로젝트 폴더(루트)

또는 PowerShell 창을 하나 띄워 `pnpm start` 를 실행해 두어도 됩니다.

## 5-1. 소셜 로그인 (선택)

구글·카카오·네이버를 붙일 수 있습니다. `apps/server/.env` 에 클라이언트를 채운 제공자만
로그인 화면에 버튼이 나옵니다. 각 콘솔에 등록할 콜백 주소는 이 형식입니다.

```
<PUBLIC_BASE_URL>/api/auth/oauth/google/callback
<PUBLIC_BASE_URL>/api/auth/oauth/kakao/callback
<PUBLIC_BASE_URL>/api/auth/oauth/naver/callback
```

- 구글: Google Cloud Console → API 및 서비스 → 사용자 인증 정보 → OAuth 클라이언트 ID(웹).
- 카카오: Kakao Developers → 내 애플리케이션 → 카카오 로그인. 동의 항목에서 **닉네임·카카오계정(이메일)** 을 켭니다.
  client secret 은 선택이라 ID 만 채워도 동작합니다.
- 네이버: NAVER Developers → 애플리케이션 등록. 제공 정보에 **이메일** 을 포함합니다.

**중요한 제약.** 구글은 `http://localhost:8787` 은 허용하지만 `http://192.168.x.x:8787` 같은
사설 IP 는 리다이렉트 주소로 등록할 수 없습니다. 즉 집 PC 에서 직접 쓸 때만 소셜 로그인이 되고,
노트북·휴대폰에서 내부 IP 로 붙을 때는 이메일·비밀번호로 로그인해야 합니다.
도메인과 HTTPS 를 붙이면(6절) `PUBLIC_BASE_URL` 만 그 주소로 바꾸고 콘솔에 다시 등록하면 됩니다.

계정 연결 규칙은 이렇습니다.

- 이미 연결된 소셜 계정이면 그 계정으로 로그인합니다.
- 로그인한 상태에서 설정 → "연결된 로그인" 에서 연결하면 현재 계정에 붙습니다.
- 제공자가 이메일을 검증해 준 경우(구글·카카오)에만 같은 이메일의 기존 계정에 자동 연결합니다.
  네이버는 검증 여부를 주지 않아 자동 연결하지 않습니다. 비밀번호로 로그인한 뒤 설정에서 연결하세요.
- 그 이메일의 계정이 없으면 `ALLOW_SIGNUP=true` 일 때만 새로 만듭니다.

## 5-2. 비밀번호 재설정

메일 발송 기능이 없어 **관리자가 링크를 만들어 직접 전달**합니다.

1. 관리자 계정으로 로그인 → 설정 → "비밀번호 재설정 링크"
2. 대상 이메일을 넣고 링크를 만들어 사용자에게 전달합니다(카카오톡·문자 등).
3. 사용자가 링크를 열어 새 비밀번호를 지정하면, 그 사용자의 모든 기기가 로그아웃됩니다.

링크는 24시간 동안만 유효하고 한 번 쓰면 만료됩니다. 새 링크를 만들면 이전 링크는 무효가 됩니다.

## 6. 다른 기기(노트북·휴대폰)에서 접속

- 같은 공유기 안: 집 PC 의 내부 IP 로 `http://192.168.x.x:8787`. Windows 방화벽에서 8787 인바운드 허용.
- 밖에서: Cloudflare Tunnel(무료)이나 Tailscale 로 집 PC 에 붙는 게 안전합니다. 공유기 포트포워딩은 권하지 않습니다.
  - Tailscale: 집 PC 와 노트북에 설치하면 `http://<집PC-tailscale-IP>:8787` 로 바로 접속. 설정 없음.
- HTTPS 로 붙이면 `.env` 에 `NODE_ENV=production` 을 두어 쿠키가 Secure 로 나가게 합니다.

## 7. 노트북에서 개발, 집 PC 에서 운영

- 노트북: 노트북의 Postgres(또는 Tailscale 로 집 PC Postgres)에 `DATABASE_URL` 을 맞추고 `pnpm dev`.
- 집 PC: `git pull && pnpm build && pnpm start`. 마이그레이션은 서버 시작 시 자동.

## 8. 백업·초기화

- 백업: Postgres 덤프(`pg_dump goods_detail_maker > backup.sql`) + `DATA_DIR` 폴더 복사.
- 전체 초기화: `drop database goods_detail_maker; create database goods_detail_maker;` 후 `DATA_DIR` 비우기.
- 특정 작업만 삭제: 앱에서 곧 제공 예정. 지금은 `delete from jobs where id = '...'` 후 `DATA_DIR/users/<user>/jobs/<job>` 폴더 삭제.

## 9. 문제 해결

- 서버가 바로 종료되며 "설정이 올바르지 않습니다": `.env` 의 DATABASE_URL, APP_SECRET(32자 이상) 확인.
- `ECONNREFUSED 5432`: Postgres 서비스가 꺼져 있음. 서비스에서 postgresql-x64-16 시작.
- 로그인 후 새로고침하면 풀림: 브라우저가 쿠키를 막는 경우. `http://localhost` 로 접속하거나 HTTPS 사용.
- 이미지가 전부 실패: 카드의 빨간 사유 문구 확인. `Invalid input image file` 이면 참조 사진 문제.
