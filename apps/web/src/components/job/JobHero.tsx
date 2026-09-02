import { STORY_STAGE_DESCRIPTIONS, STORY_STAGE_LABELS, type Job } from "@gdm/shared";

interface Props {
  job: Job;
  total: number;
  completed: number;
  failed: number;
}

export function JobHero({ job, total, completed, failed }: Props) {
  const inProgress = job.sections.length - completed - failed;
  return (
    <header className="job-hero">
      <div className="job-hero__copy">
        <p className="eyebrow">상세페이지 {total}장 제작실</p>
        <h1>{job.productName}</h1>
        <p>
          구매 흐름에 맞춘 {total}장을 각각 만들고 있어요. 완성된 장은 바로 확인하고, 마음에 들지
          않거나 실패한 한 장만 골라 다시 만들 수 있습니다.
        </p>
      </div>
      <dl className="job-summary" aria-label="전체 진행 요약">
        <div>
          <dt>완료</dt>
          <dd>{completed}</dd>
        </div>
        <div>
          <dt>실패</dt>
          <dd>{failed}</dd>
        </div>
        <div>
          <dt>진행</dt>
          <dd>{inProgress}</dd>
        </div>
      </dl>
      <p className="job-summary__text" role="status">
        완료 {completed} / 실패 {failed} / 진행 {inProgress}
      </p>
      {job.sections.length > 0 && (
        <ol className="job-sequence" aria-label={`${total}장 진행 순서`}>
          {job.sections.map((s) => (
            <li key={s.index} className={`job-sequence__item job-sequence__item--${s.status}`}>
              <span>{s.index}</span>
            </li>
          ))}
        </ol>
      )}
      <ol className="job-story-flow" aria-label="선택한 상세페이지 설득 흐름">
        {job.storyOrder.map((stage, i) => {
          const section = job.sections[i];
          return (
            <li
              key={`${stage}-${i}`}
              className={
                section
                  ? `job-story-flow__item job-story-flow__item--${section.status}`
                  : "job-story-flow__item"
              }
            >
              <span className="job-story-flow__number">{String(i + 1).padStart(2, "0")}</span>
              <span>
                <strong className="job-story-flow__label">{STORY_STAGE_LABELS[stage]}</strong>
                <small>{STORY_STAGE_DESCRIPTIONS[stage]}</small>
              </span>
            </li>
          );
        })}
      </ol>
    </header>
  );
}
