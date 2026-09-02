import { useNavigate } from "react-router";
import { DEFAULT_STORY_ORDER, STORY_STAGE_LABELS, TONES, TONE_META } from "@gdm/shared";

/**
 * 새 상세페이지 폼 — 골격.
 * TODO(form): 4개 카드(브리프 / 표현·스타일 / 이미지 업로드 / 스토리 순서) + 우측 요약 카드,
 *   이미지 정규화(features/inputs), jobsApi.create → upload → start 순차 호출과 이어서 시도.
 */
export function NewJobPage() {
  const navigate = useNavigate();
  return (
    <main className="new-job-page">
      <nav className="studio-topbar" aria-label="제작실 메뉴">
        <button className="studio-brand" type="button" onClick={() => navigate("/")}>
          <span aria-hidden="true">D</span>
          <strong>Detail Studio</strong>
        </button>
        <div className="studio-topbar__meta">
          <span>BYOK</span>
          <p>내 API 키로 안전하게 생성</p>
        </div>
      </nav>
      <section className="creation-hero">
        <p className="page-eyebrow">01 새 프로젝트</p>
        <h1>
          상품 하나로, <br />
          <em>구매까지 이끄는 13장</em>을
        </h1>
      </section>
      <section className="form-card">
        <h2>상세페이지 스타일 (13장 공통)</h2>
        <ul>
          {TONES.map((tone) => (
            <li key={tone}>
              <strong>{TONE_META[tone].label}</strong> — {TONE_META[tone].description}
            </li>
          ))}
        </ul>
      </section>
      <section className="form-card">
        <h2>추천 설득 흐름</h2>
        <ol>
          {DEFAULT_STORY_ORDER.map((stage) => (
            <li key={stage}>{STORY_STAGE_LABELS[stage]}</li>
          ))}
        </ol>
      </section>
    </main>
  );
}
