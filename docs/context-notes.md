# 맥락 노트

작업 중 내린 결정과 그 이유. 다음 세션이 같은 고민을 다시 하지 않도록 남긴다. 새 결정은 아래에 덧붙인다.

## B1. 단계 1~13 선택 (2026-09-04)

### 착수 전에 확인한 것 — 백로그보다 이미 많이 되어 있었다

`docs/status.md` 의 B1 항목에는 "`jobs.section_count` 저장", "start 시 예약 용량 N×3MB" 가 할 일로 적혀 있었지만 둘 다 이미 구현돼 있다.

- `0001_init.sql` 에 `section_count int not null default 13 check (section_count between 1 and 13)` 컬럼이 있다.
- `POST /api/jobs` 가 `brief.data.storyOrder.length` 를 그 컬럼에 넣는다.
- `POST /api/jobs/:id/start` 가 `job.section_count * RAW_RESERVE_BYTES_PER_SECTION` 로 예약한다.

즉 **마이그레이션은 필요 없다.** 자체 호스팅 전환(`9dc8c71`) 때 스키마를 새로 쓰면서 미리 넣어 둔 것으로 보인다. 백로그 문구만 낡았다.

### D1. role 축을 storyOrder 에 종속시킨다

현재 구조는 두 축이 독립이다.

- `SECTION_ROLES[i]` — index 슬롯에 **고정**된 장면 구도 역할 (HERO, PROBLEM, SOLUTION, …)
- `storyOrder[i]` — 사용자가 재배열하는 설득 단계 (HERO, PROBLEM, GAP, …)

13개를 다 쓰고 순서만 바꿀 때는 이 어긋남이 "구도는 슬롯, 메시지는 단계" 로 해석돼 그럭저럭 굴러갔다. 그런데 **부분 선택을 허용하면 무너진다.** 예를 들어 사용자가 `PRODUCT_INFO` 하나만 고르면 index 1 의 role 은 `HERO`(전신 제품 컷, 카피는 제품과 겹치지 않게)가 되어 "제품 정보 정리" 라는 단계 의도와 무관한 구도가 나온다.

그래서 `STAGE_TO_ROLE` 매핑을 두고 `index i 의 role = STAGE_TO_ROLE[storyOrder[i-1]]` 로 바꾼다. 매핑은 status.md 백로그에 적혀 있던 제안을 그대로 쓴다.

| 단계        | role      | 단계            | role         |
| ----------- | --------- | --------------- | ------------ |
| HERO        | HERO      | SUCCESS         | REVIEW       |
| PROBLEM     | PROBLEM   | LOSS            | COMPARISON   |
| GAP         | BENEFIT_A | CLOSING         | GIFT         |
| GUIDE       | BENEFIT_B | SITUATIONS      | USAGE        |
| CORE_REASON | SOLUTION  | BENEFIT_ARCHIVE | TRUST        |
| PLAN        | DETAIL    | PRODUCT_INFO    | PRODUCT_INFO |
| OFFER       | CTA       |                 |              |

### D2. `jobSchema` 의 role 슬롯 검증은 제거한다 (기존 작업 호환)

D1 의 매핑을 기본 순서(`DEFAULT_STORY_ORDER`)에 적용하면 role 배열이 기존 `SECTION_ROLES` 와 **다르다**. 3번이 대표적이다.

- 기존: index 3 = `SOLUTION`
- 새 매핑: index 3 = `GAP` → `BENEFIT_A`

기존 13장 작업의 `job_sections.role` 은 이미 `SECTION_ROLES` 순으로 DB 에 저장돼 있다. 응답 스키마에서 role 슬롯을 새 규칙으로 고정하면 **과거 작업이 열리지 않는다.** B1 완료 기준에 "13장 기존 작업도 열림" 이 있으므로 이 길은 막혔다.

선택지는 셋이었다.

1. storyOrder 기반으로 검증 → 기존 작업 깨짐. 탈락.
2. 두 패턴을 union 으로 허용 → 규칙이 둘이 되어 읽는 사람이 매번 헷갈린다.
3. **`jobSchema` 에서는 role 슬롯을 보지 않고 index 오름차순만 확인** → 채택.

3을 고른 이유는 검증 위치가 다르기 때문이다. role 정합성은 **모델 출력을 받을 때** (`sectionPlanListSchema`) 강제하면 충분하다. `jobSchema` 는 우리 서버가 DB 에서 읽어 만든 응답을 웹이 다시 확인하는 것이라, 여기서 슬롯까지 재검증하는 것은 중복이고 과거 데이터와 충돌만 만든다.

같은 이유로 `sections` 길이도 `0 | 10 | 13` union 에서 `0개 또는 1..13개` 로 바꾼다. `LEGACY_SECTION_COUNT`(10) 를 특별 취급할 이유가 사라진다.

### D3. `sectionPlanListSchema` 는 storyOrder 를 받는 팩토리로

지금은 상수 스키마라 길이가 13 으로 박혀 있다. storyOrder 가 있어야 길이와 role 슬롯을 둘 다 정할 수 있으므로 `sectionPlanListSchema(storyOrder)` 형태로 바꾼다. 호출부는 `packages/ai/src/openai.ts` 의 `planSections()` 한 곳이다.

### D4. 내보내기 파일명은 섹션의 실제 role 을 쓴다

`download.ts` 의 `sectionFileName(index)` 이 `SECTION_ROLES[index - 1]` 로 파일명을 만든다. role 이 단계 종속이 되면 index 만으로는 알 수 없으므로 role 을 인자로 받게 바꾼다. 호출부는 `exportZip.ts` 와 `JobPage.tsx` 두 곳이다.

백로그에는 없던 항목이다. B1 을 하면 반드시 깨지는 자리라 함께 고친다.

### D5. `SECTION_COUNT` 는 남긴다

상수 자체는 "한 작업이 만들 수 있는 **최대** 장 수" 로 의미가 바뀔 뿐 여전히 필요하다. `sectionIndexSchema` 상한, DB check, InfoPage 의 소개 문구가 이 값을 쓴다. 개별 작업의 장 수는 `job.section_count` / `job.sections.length` 를 쓴다.

### D6. 서버는 한 줄도 고치지 않았다

착수 전 예상과 달리 `apps/server` 는 변경이 필요 없었다.

- `POST /api/jobs` — 이미 `storyOrder.length` 를 `section_count` 에 넣는다.
- `POST /api/jobs/:id/start` — 이미 `section_count × RAW_RESERVE_BYTES_PER_SECTION` 를 예약한다.
- `queue/plan.ts` — 기획 결과 배열을 그대로 순회해 enqueue 하므로 개수에 자동으로 따라온다.

`routes/jobs.ts` 의 `sectionIndexParam` 상한이 상수 13 으로 남아 있는 것은 일부러 두었다. 3장짜리 작업에 index 5 를 요청해도 `getSection` 이 행을 찾지 못해 이미 `SECTION_NOT_FOUND` 가 나간다. 작업별 상한을 다시 계산해도 결과가 같아서, 코드만 늘고 얻는 것이 없다.

### D7. 빼둔 단계는 사라지지 않고 자리를 지킨다

UI 에서 단계를 뺄 때 목록에서 제거하면 상태가 하나(선택된 배열)로 끝나 단순하다. 그런데 실수로 뺐다가 되돌리면 그 단계가 맨 뒤로 가서 애써 잡은 순서가 망가진다.

그래서 화면은 13개를 늘 보여 주고, 뺀 단계는 점선·취소선으로 흐리게 두어 자리를 지키게 했다. 상태는 `NewJobPage` 가 "전체 순서(`stageOrder`)" 와 "뺀 단계(`excluded`)" 두 개로 들고, 서버에 보내는 `storyOrder` 는 그 둘에서 계산한다. 번호는 고른 것끼리만 1번부터 이어진다.

마지막 한 단계는 체크를 풀 수 없다. 최소 1장이 서버 스키마(`storyOrderSchema.min(1)`)와 DB check 양쪽의 조건이기도 하다.

### 실제 환경 검증 결과 (2026-09-04)

집 PC 의 Postgres 와 실제 OpenAI 키로 확인했다.

- **3단계 작업 `46b6e8b1`** — HERO / GAP / PRODUCT_INFO 를 골라 생성했다. 기획이 섹션을 3개만 돌려주었고 role 은 HERO / BENEFIT_A / PRODUCT_INFO 로 `STAGE_TO_ROLE` 매핑대로 나왔다. 이미지 3장이 모두 생성되어 `status=completed`, 디스크에 `raw/01~03.json` 이 남았다.
- **기존 13장 작업 `4f653ecf`** — role 이 옛 슬롯 순서(`index 3 = SOLUTION`)인데도 13장 그대로 열린다. D2 의 판단이 의도대로 동작했다는 증거다.

검증용으로 서버에 임시 세션을 발급해 API 를 직접 호출했고, 스크립트와 세션은 확인 후 지웠다.

### 남은 검증

브라우저 UI 는 아직 눈으로 보지 못했다. 미리보기·JPG·ZIP·세로 합본은 Canvas 합성 경로라 로그인한 브라우저가 필요하다. 타입체크·web 테스트·`vite build` 는 통과했으므로 남은 위험은 렌더링 쪽이다. 특히 아래 두 가지를 보면 된다.

1. 새 상세페이지 화면에서 단계 체크를 풀었을 때 번호가 다시 매겨지고 요약 카드의 장수·비용이 따라 바뀌는지
2. 3장 작업의 ZIP 파일명이 `01-hero.jpg` / `02-benefit_a.jpg` / `03-product_info.jpg` 로 나오는지 (role 인자 변경 지점)

## B2. 옵션별 썸네일 + 메인 썸네일 (2026-09-04)

### 착수 전 확인

B1 과 달리 **미리 되어 있는 것이 하나도 없다.** 코드에 `thumbnail` 흔적이 없고 `job_thumbnails` 테이블도 없다. 백로그 문구 그대로가 남은 일 전부다.

### D1. job_sections 확장이 아니라 새 테이블

백로그는 "`job_thumbnails` 새 테이블 또는 job_sections 확장" 으로 열어 뒀다. 새 테이블로 간다.

썸네일에는 headline·bullets·copy_version·feedback 이 없다. 같은 테이블에 넣으면 절반이 늘 null 인데, 그보다 큰 문제는 **`deriveJobStatus` 가 섹션 개수로 작업 상태를 계산한다**는 것이다. 썸네일이 섞이면 "13장 중 5장 완료" 같은 진행률과 completed 판정이 전부 틀어진다. B1 에서 막 정리한 index·role 규칙도 다시 오염된다.

### D2. 대신 동시 생성 슬롯은 반드시 합쳐야 한다

테이블을 나누면 생기는 대가가 있다. `claim_image_slot(...)` 은 이렇게 센다.

```sql
select count(*) from job_sections where user_id = ... and status = 'generating'
```

`job_sections` 만 본다. 썸네일을 다른 테이블에 두고 이 함수를 그대로 쓰면, 썸네일 생성이 **슬롯 밖에서** 돌아 사용자가 정한 동시 생성 한도(5 또는 10)를 넘겨 OpenAI 를 때린다. 429 를 자초하는 셈이다.

그래서 마이그레이션에서 `claim_image_slot` 을 두 테이블 합산으로 교체하고, 같은 규칙을 쓰는 `claim_thumbnail_slot` 을 추가한다. `storage_usage` 도 같은 이유로 job_thumbnails 바이트를 더해야 한다.

### D3. 옵션 사진은 기획 참조에서 빼야 한다

옵션 사진을 기존 `job_inputs` 에 그냥 넣으면 `loadInputImages()` 가 전부 읽어 기획·본문 이미지의 참조로 써버린다. 빨강·파랑·검정 옵션 사진이 섞이면 본문 13장의 제품 색이 흔들린다.

`job_inputs.role`('product' | 'option')을 추가하고 `loadInputImages` 는 product 만 읽는다. 기존 행은 전부 'product' 로 채운다. 옵션 사진은 그 옵션의 썸네일을 만들 때만 참조로 들어간다.

### D4. 메인 썸네일은 격자 합성이 기본, AI 배치는 선택

사용자 결정으로 둘 다 제공한다.

- **격자 합성(기본)** — 이미 만든 옵션 썸네일을 Canvas 로 붙인다. 사용료 0원이고 실제 옵션과 정확히 일치한다. 옵션 수에 따라 2×2(≤4) · 3×2(≤6) · 3×3(≤9).
- **AI 배치(선택)** — 옵션 사진들을 함께 참조로 넣어 한 장면에 배치한다. 상업 사진처럼 보이지만 사진과 달라질 위험이 있고 사용료가 1회 더 든다. 진행 화면의 버튼으로만 실행한다.

기본을 격자로 둔 이유는 마켓 썸네일이 "실제 파는 것과 같은가" 가 중요한 자리라서다. 돈이 더 들면서 사실과 어긋날 수 있는 쪽을 기본값으로 둘 이유가 없다.

### D5. 크기 — 1024 로 만들고 1000 으로 줄인다

이미지 모델이 1000×1000 을 직접 만들지 못하므로 1024×1024 로 받아 브라우저에서 줄인다. `assertJpegDimensions()` 가 지금 1024×1536 을 하드코딩하고 있어, 기대 규격을 인자로 받도록 바꾼다.

### D6. 옵션이 없으면 아무것도 달라지지 않는다

옵션을 하나도 넣지 않은 작업은 job_thumbnails 행이 생기지 않고 진행 화면에 썸네일 섹션도 뜨지 않는다. 기존 작업과 완전히 같게 동작해야 한다.

### B2 실제 환경 검증 결과 (2026-09-04)

옵션 2개("1kg 소량", "3kg 실속") + 본문 1장짜리 작업 `56b8328e` 로 확인했다.

- 옵션 썸네일 2장이 각각 **1024×1024** 로 생성되어 디스크에 남았고, 브라우저에서 **1000×1000** 으로 줄여 표시된다.
- 격자 메인이 옵션 2장을 가로로 붙여 자동 합성됐다. 사용료가 들지 않는다.
- "AI로 한 장면 만들기" 를 눌러 만든 메인도 completed 로 끝났다.
- 진행 중 화면에서 본문과 썸네일이 함께 generating 이었다. 슬롯 합산(D2)이 실제로 동작한다는 뜻이다.
- 옵션이 없는 기존 작업(3장·13장)은 `thumbnails: []` 로 응답하고 썸네일 구역이 뜨지 않는다.

### 검증 중에 고친 것 두 가지

**object URL 을 상태 변화마다 되돌려 이미지가 깨졌다.** 정리 effect 의 의존성을 `[previews]` 로 둔 탓에, 썸네일이 하나 준비될 때마다 직전 Map 의 URL 이 전부 revoke 됐다. 새 Map 이 같은 항목을 담고 있어도 URL 은 이미 죽은 상태라, 카드 네 개 중 하나만 그림이 떴다. 언마운트에서 한 번만 정리하도록 바꿨다.

같은 effect 의 `alive` 플래그도 문제였다. effect 가 재실행될 때마다 cleanup 이 돌아 `alive=false` 가 되어, 그때 진행 중이던 다른 fetch 의 결과가 버려졌다. 언마운트 기준 `mounted` ref 로 바꿨다.

**격자가 옵션 2개일 때 아래 절반을 비웠다.** `gridSize` 가 4개 이하를 모두 2×2 로 잡았다. 2개는 2×1, 3개는 3×1 로 나눠 빈 줄이 생기지 않게 했다.

### 내보내기 실제 확인 (2026-09-04)

브라우저에서 버튼을 눌러 실제 파일을 받아 열어 봤다.

| 대상                    | 결과                                                                                                                                                       |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 옵션 작업 ZIP           | 5개 — `01-hero.jpg`(1024×1536), `thumb-main.jpg`, `thumb-main-ai.jpg`, `thumb-01-1kg-소량.jpg`, `thumb-02-3kg-실속.jpg`(모두 1000×1000). 전부 유효한 JPEG. |
| 세로 합본               | 1024×1536 (본문 1장)                                                                                                                                       |
| 옵션 없는 13장 작업 ZIP | 13개, 썸네일 없음. 썸네일 구역도 뜨지 않는다.                                                                                                              |

13장 작업의 파일명이 `01-hero.jpg` … `03-solution.jpg` … `13-product_info.jpg` 로 나온 것이 특히 중요하다. B1 에서 `sectionFileName(index, role)` 로 바꾸면서 role 을 섹션 행에서 읽게 했는데, 옛 작업은 DB 에 옛 슬롯 순서(index 3 = SOLUTION)로 저장돼 있으므로 그 값이 그대로 파일명이 된다. 새 규칙을 소급 적용하지 않아 과거 작업의 내보내기가 깨지지 않는다.
