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
pnpm build          # 웹 빌드 + 서버 빌드
pnpm start          # http://localhost:8787
```

개발 중에는 `pnpm dev` (웹 5173 + 서버 8787, 웹이 /api 를 서버로 프록시).

첫 접속에서 "계정 만들기"로 가입하면 그 계정이 관리자가 됩니다. 이후 설정 → OpenAI 키 저장 → 새 상세페이지.

## 5. PC 부팅 시 자동 시작 (선택)

작업 스케줄러 → 기본 작업 만들기 → 트리거 "로그온할 때" → 동작 "프로그램 시작":

- 프로그램: `C:\Program Files\nodejs\node.exe`
- 인수: `apps\server\dist\index.js`
- 시작 위치: 프로젝트 폴더의 `apps\server`

또는 PowerShell 창을 하나 띄워 `pnpm start` 를 실행해 두어도 됩니다.

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
