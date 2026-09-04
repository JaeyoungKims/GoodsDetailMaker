import { useState, type DragEvent } from "react";
import {
  DEFAULT_STORY_ORDER,
  STORY_STAGE_DESCRIPTIONS,
  STORY_STAGE_LABELS,
  type StoryStage,
} from "@gdm/shared";

interface Props {
  /** 13단계 전체의 순서. 빼둔 단계도 자리를 지킨다. */
  order: StoryStage[];
  /** 이번 작업에서 뺀 단계 */
  excluded: ReadonlySet<StoryStage>;
  onChange: (order: StoryStage[]) => void;
  onToggle: (stage: StoryStage) => void;
}

function moveItem(list: StoryStage[], from: number, to: number): StoryStage[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** 빼둔 단계는 번호가 없다. 선택된 것끼리만 1번부터 이어진다. */
function pickedNumbers(
  order: StoryStage[],
  excluded: ReadonlySet<StoryStage>,
): Array<number | null> {
  let n = 0;
  return order.map((stage) => (excluded.has(stage) ? null : (n += 1)));
}

/** 설득 흐름 13단계. 쓸 단계만 골라 드래그 또는 ↑↓ 로 재배열, "추천 순서로" 리셋. */
export function StoryOrderEditor({ order, excluded, onChange, onToggle }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const numbers = pickedNumbers(order, excluded);
  const pickedCount = order.length - excluded.size;

  function onDragStart(index: number) {
    setDragIndex(index);
  }
  function onDragOver(event: DragEvent<HTMLLIElement>) {
    event.preventDefault();
  }
  function onDrop(index: number) {
    if (dragIndex !== null) onChange(moveItem(order, dragIndex, index));
    setDragIndex(null);
  }

  return (
    <>
      <div className="story-order-intro">
        <p>
          구매까지 이어지는 설득 순서예요. 필요한 단계만 골라 순서를 바꿀 수 있고, 고른 단계마다 한
          장의 이미지가 만들어집니다.
        </p>
        <span>{pickedCount}단계 선택</span>
      </div>
      <ol className="story-order-list" aria-label="설득 흐름 순서">
        {order.map((stage, index) => {
          const number = numbers[index];
          const picked = number !== null;
          return (
            <li
              key={stage}
              className={picked ? undefined : "is-excluded"}
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={onDragOver}
              onDrop={() => onDrop(index)}
              onDragEnd={() => setDragIndex(null)}
              aria-label={`${picked ? `${number}번` : "빼둔 단계"} ${STORY_STAGE_LABELS[stage]}`}
            >
              <input
                type="checkbox"
                className="story-order-pick"
                checked={picked}
                disabled={picked && pickedCount === 1}
                onChange={() => onToggle(stage)}
                aria-label={`${STORY_STAGE_LABELS[stage]} 사용`}
              />
              <span className="story-order-handle" aria-hidden="true">
                ⋮⋮
              </span>
              <b aria-hidden="true">{picked ? String(number).padStart(2, "0") : "–"}</b>
              <div>
                <strong>{STORY_STAGE_LABELS[stage]}</strong>
                <small>{STORY_STAGE_DESCRIPTIONS[stage]}</small>
              </div>
              <div className="story-order-actions">
                <button
                  type="button"
                  aria-label="위로"
                  disabled={index === 0}
                  onClick={() => onChange(moveItem(order, index, index - 1))}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="아래로"
                  disabled={index === order.length - 1}
                  onClick={() => onChange(moveItem(order, index, index + 1))}
                >
                  ↓
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {pickedCount === 1 && (
        <p className="story-order-hint" role="status">
          최소 한 단계는 있어야 해요.
        </p>
      )}
    </>
  );
}

export function StoryOrderReset({ onReset }: { onReset: (order: StoryStage[]) => void }) {
  return (
    <button
      type="button"
      className="story-order-reset"
      onClick={() => onReset([...DEFAULT_STORY_ORDER])}
    >
      추천 순서로
    </button>
  );
}
