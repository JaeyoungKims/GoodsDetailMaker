import { IMAGE_HEIGHT, IMAGE_WIDTH, SECTION_COUNT } from "@gdm/shared";
import type { CreateJobState } from "@/features/jobs/useCreateJob";

interface Props {
  state: CreateJobState;
  disabled: boolean;
}

function buttonLabel(phase: CreateJobState["phase"]): string {
  switch (phase) {
    case "submitting":
      return "처리 중…";
    case "done":
      return "생성 요청 완료";
    case "resumable":
      return "이어서 시도";
    default:
      return `${SECTION_COUNT}장 생성 시작`;
  }
}

/** 우측 고정 요약 카드 + 제출 버튼 */
export function CreationSummary({ state, disabled }: Props) {
  return (
    <aside className="creation-summary">
      <div className="creation-summary__card">
        <p className="page-eyebrow">
          <span>{SECTION_COUNT}</span> OUTPUT
        </p>
        <h2>{SECTION_COUNT}장 · 전환 퍼널 · 가성비</h2>
        <div className="summary-frames" aria-hidden="true">
          {Array.from({ length: SECTION_COUNT }, (_, i) => (
            <span key={i}>{String(i + 1).padStart(2, "0")}</span>
          ))}
        </div>
        <dl>
          <div>
            <dt>이미지 규격</dt>
            <dd>
              {IMAGE_WIDTH} × {IMAGE_HEIGHT}
            </dd>
          </div>
          <div>
            <dt>이미지 품질</dt>
            <dd>가성비 · Medium</dd>
          </div>
          <div>
            <dt>생성 방식</dt>
            <dd>각 장 독립 처리</dd>
          </div>
          <div>
            <dt>결과 구성</dt>
            <dd>문구 포함 완성 {SECTION_COUNT}장</dd>
          </div>
          <div>
            <dt>설득 순서</dt>
            <dd>내가 정한 {SECTION_COUNT}단계</dd>
          </div>
          <div>
            <dt>장면 구성</dt>
            <dd>미입력 시 AI 자동 기획</dd>
          </div>
          <div>
            <dt>비용 청구</dt>
            <dd>내 OpenAI 계정</dd>
          </div>
        </dl>
        <div className="summary-note">
          <span aria-hidden="true">i</span>
          <p>
            기획 1회와 이미지 {SECTION_COUNT}회의 OpenAI 사용료가 내 계정에 청구됩니다. 실패한 장은
            자동으로 다시 시도하며, 이때도 사용료가 발생할 수 있어요.
          </p>
        </div>
        <button className="create-button" type="submit" disabled={disabled}>
          <span>{buttonLabel(state.phase)}</span>
          <b aria-hidden="true">→</b>
        </button>
        {state.message && (
          <p className="form-status" role="status" aria-live="polite">
            {state.message}
          </p>
        )}
        <small className="summary-terms">
          시작하면 이용 조건과 개인정보 안내에 동의한 것으로 봅니다. 작업과 이미지는 24시간 뒤 자동
          삭제됩니다.
        </small>
      </div>
    </aside>
  );
}
