# GoodsDetailMaker — 상세페이지 13장 제작실 (자체 호스팅)

상품 이미지와 정보를 한 번 입력하면 AI가 구매 퍼널 13단계를 기획하고, 각 단계를 1024×1536 이미지로
독립 생성하는 BYOK(사용자 본인 OpenAI 키) 도구입니다. **집 PC 한 대에서 전부 실행**됩니다.

- 셋업 가이드: [docs/setup.md](docs/setup.md)
- 현황·백로그: [docs/status.md](docs/status.md)
- 아키텍처: [docs/architecture.md](docs/architecture.md)
- 참고 사이트 역분석: [docs/reference/detail-page-studio-analysis.md](docs/reference/detail-page-studio-analysis.md)

## 스택

| 영역   | 기술                                                                                         |
| ------ | -------------------------------------------------------------------------------------------- |
| 프론트 | React 19, Vite 7, React Router 7, zod 4                                                      |
| 서버   | Node 22, Hono, postgres.js, pg-boss(큐), 로컬 디스크 저장, 쿠키 세션 로그인, SSE 진행 스트림 |
| DB     | PostgreSQL 16 (Windows 에 설치된 것 그대로)                                                  |
| AI     | OpenAI gpt-image-2 (이미지), Responses API (기획·프롬프트 재작성)                            |

## 빠른 시작

```bash
pnpm install
cp apps/server/.env.example apps/server/.env   # DATABASE_URL, DATA_DIR, APP_SECRET 채우기
pnpm dev            # 웹 5173 + 서버 8787 (개발)
pnpm build && pnpm start   # 운영: http://localhost:8787
```

첫 접속에서 계정을 만들면 관리자가 됩니다. 설정에서 OpenAI 키를 저장한 뒤 새 상세페이지를 시작하세요.

## 폴더

```
apps/web         SPA
apps/server      API + 큐 컨슈머 + 정적 서빙 (한 프로세스)
packages/shared  도메인 상수·zod 스키마·에러 코드
packages/ai      OpenAI 호출 계층 (기획 프롬프트, 이미지 생성, 프롬프트 재작성)
docs             문서
```
