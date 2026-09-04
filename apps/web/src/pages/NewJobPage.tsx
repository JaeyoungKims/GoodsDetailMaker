import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { DEFAULT_STORY_ORDER, type StoryStage, type Tone } from "@gdm/shared";
import { CreationSummary } from "@/components/new-job/CreationSummary";
import { ImageDropzone } from "@/components/new-job/ImageDropzone";
import { StoryOrderEditor, StoryOrderReset } from "@/components/new-job/StoryOrderEditor";
import { StylePicker } from "@/components/new-job/StylePicker";
import { useAccessToken } from "@/features/auth/useAuth";
import { useCreateJob } from "@/features/jobs/useCreateJob";
import "@/styles/new-job.css";

function lines(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split("\n")
    .map((v) => v.trim())
    .filter(Boolean);
}

/** 새 상세페이지: 브리프 → 표현·스타일 → 이미지 → 설득 순서 → 생성 시작 */
export function NewJobPage() {
  const navigate = useNavigate();
  const accessToken = useAccessToken();
  const [files, setFiles] = useState<File[]>([]);
  const [tone, setTone] = useState<Tone>("warm_lifestyle");
  const [stageOrder, setStageOrder] = useState<StoryStage[]>([...DEFAULT_STORY_ORDER]);
  const [excluded, setExcluded] = useState<ReadonlySet<StoryStage>>(new Set());
  const storyOrder = stageOrder.filter((stage) => !excluded.has(stage));
  const { state, submit } = useCreateJob({
    accessToken,
    onStarted: (jobId) => navigate(`/jobs/${jobId}`),
  });

  const locked = state.phase === "submitting" || state.phase === "done";
  const sectionCount = storyOrder.length;

  /** 마지막 한 단계는 뺄 수 없다 (최소 1장) */
  function toggleStage(stage: StoryStage) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(stage)) next.delete(stage);
      else if (stageOrder.length - next.size > 1) next.add(stage);
      return next;
    });
  }

  function resetStages(order: StoryStage[]) {
    setStageOrder(order);
    setExcluded(new Set());
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void submit({
      brief: {
        productName: data.get("productName"),
        category: data.get("category"),
        targetCustomer: data.get("targetCustomer"),
        coreBenefits: lines(data.get("coreBenefits")),
        evidence: lines(data.get("evidence")),
        prohibitedClaims: lines(data.get("prohibitedClaims")),
        additionalNotes: data.get("additionalNotes"),
        tone,
        storyOrder,
      },
      files,
    });
  }

  return (
    <main className="new-job-page">
      <nav className="studio-topbar" aria-label="제작실 메뉴">
        <button
          className="studio-brand"
          type="button"
          onClick={() => navigate("/")}
          aria-label="제작실 홈으로"
        >
          <span aria-hidden="true">GD</span>
          <strong>Goods Detail</strong>
        </button>
        <div className="studio-topbar__meta">
          <span>BYOK</span>
          <p>내 API 키로 안전하게 생성</p>
        </div>
      </nav>

      <section className="creation-hero">
        <div>
          <p className="page-eyebrow">
            <span>01</span> 새 프로젝트
          </p>
          <h1>
            상품 하나로, <br />
            <em>구매까지 이끄는 {sectionCount}장</em>을
          </h1>
          <p className="creation-hero__lead">
            제품 이미지만 올려도 AI가 상품을 분석합니다. 아는 정보만 더하면 판매 문구와 디자인까지
            장별로 기획하고, 콜라주가 아닌 전환 퍼널 완성 이미지 {sectionCount}장으로 각각
            생성합니다.
          </p>
        </div>
        <ul className="creation-points" aria-label="제작 방식">
          <li>
            <strong>01</strong>
            <span>한 번만 입력</span>
          </li>
          <li>
            <strong>{sectionCount}</strong>
            <span>각 장 독립 생성</span>
          </li>
          <li>
            <strong>↻</strong>
            <span>실패한 장만 재시도</span>
          </li>
        </ul>
      </section>

      <form className="studio-form" onSubmit={onSubmit}>
        <div className="studio-form__content">
          <fieldset disabled={locked}>
            <section className="form-card" aria-labelledby="product-section-title">
              <header className="form-card__header">
                <span>01</span>
                <div>
                  <p>PRODUCT BRIEF</p>
                  <h2 id="product-section-title">어떤 상품을 소개할까요?</h2>
                </div>
                <small>이미지만 필수</small>
              </header>
              <div className="field-grid">
                <label className="field">
                  <span>
                    상품명 <b>선택</b>
                  </span>
                  <input
                    name="productName"
                    maxLength={80}
                    placeholder="예: 오프화이트 무선 미니 가습기"
                  />
                </label>
                <label className="field">
                  <span>
                    카테고리 <b>선택</b>
                  </span>
                  <input name="category" maxLength={80} placeholder="예: 생활가전 / 계절가전" />
                </label>
                <label className="field field--wide">
                  <span>
                    주요 고객 <b>선택</b>
                  </span>
                  <textarea
                    name="targetCustomer"
                    maxLength={240}
                    placeholder="누가, 어떤 상황에서 이 상품을 필요로 하는지 적어주세요."
                  />
                  <small>
                    비워두면 제품 사진에서 확인되는 사용 맥락을 바탕으로 보수적으로 기획해요.
                  </small>
                </label>
                <label className="field field--wide">
                  <span>
                    핵심 장점 <b>선택</b>
                  </span>
                  <textarea
                    name="coreBenefits"
                    placeholder={"풍부한 분사량\n저소음 설계\n세척이 쉬운 분리형 수조"}
                  />
                  <small>
                    아는 장점은 줄마다 입력하세요(최대 5개). 비워두면 사진에서 보이는 특징만
                    사용해요.
                  </small>
                </label>
              </div>
            </section>

            <section className="form-card" aria-labelledby="proof-section-title">
              <header className="form-card__header">
                <span>02</span>
                <div>
                  <p>CLAIM &amp; STYLE</p>
                  <h2 id="proof-section-title">표현과 분위기의 기준을 알려주세요</h2>
                </div>
                <small>선택 정보</small>
              </header>
              <div className="field-grid">
                <label className="field">
                  <span>장점을 뒷받침하는 근거</span>
                  <textarea name="evidence" placeholder={"KC 인증 완료\n자사 테스트 기준 28dB"} />
                  <small>여기 적은 근거만 상세페이지에 사용해요(최대 8개).</small>
                </label>
                <label className="field">
                  <span>사용하면 안 되는 표현</span>
                  <textarea
                    name="prohibitedClaims"
                    placeholder={"완치, 100% 효과 등\n경쟁사 직접 비교"}
                  />
                  <small>법적·플랫폼 정책상 피해야 할 표현을 적어주세요(최대 10개).</small>
                </label>
                <StylePicker value={tone} onChange={setTone} />
                <label className="field field--wide">
                  <span>꼭 넣고 싶은 장면·추가 메모</span>
                  <textarea
                    name="additionalNotes"
                    maxLength={1000}
                    placeholder="예: 침실 협탁 위에 놓인 장면, 아이 방에서 쓰는 장면을 꼭 넣어주세요."
                  />
                  <small>
                    기획 단계에서 참고합니다. 확인되지 않은 가격·후기·인증은 반영하지 않아요.
                  </small>
                </label>
              </div>
            </section>

            <section className="form-card" aria-labelledby="image-section-title">
              <header className="form-card__header">
                <span>03</span>
                <div>
                  <p>REFERENCE IMAGE</p>
                  <h2 id="image-section-title">상품 기준 이미지를 올려주세요</h2>
                </div>
                <small>1~5장</small>
              </header>
              <ImageDropzone files={files} onChange={setFiles} />
            </section>

            <section className="form-card story-order-card" aria-labelledby="story-section-title">
              <header className="form-card__header">
                <span>04</span>
                <div>
                  <p>STORY FLOW</p>
                  <h2 id="story-section-title">추천 설득 흐름</h2>
                </div>
                <StoryOrderReset onReset={resetStages} />
              </header>
              <StoryOrderEditor
                order={stageOrder}
                excluded={excluded}
                onChange={setStageOrder}
                onToggle={toggleStage}
              />
            </section>
          </fieldset>
        </div>

        <CreationSummary state={state} disabled={locked} sectionCount={sectionCount} />
      </form>
    </main>
  );
}
