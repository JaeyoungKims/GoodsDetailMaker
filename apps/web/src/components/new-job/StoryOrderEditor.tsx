import { useState, type DragEvent } from "react";
import {
  DEFAULT_STORY_ORDER,
  STORY_STAGE_DESCRIPTIONS,
  STORY_STAGE_LABELS,
  type StoryStage,
} from "@gdm/shared";

interface Props {
  order: StoryStage[];
  onChange: (order: StoryStage[]) => void;
}

function moveItem(list: StoryStage[], from: number, to: number): StoryStage[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item!);
  return next;
}

/** 설득 흐름 13단계. 드래그 또는 ↑↓ 버튼으로 재배열, "추천 순서로" 리셋. */
export function StoryOrderEditor({ order, onChange }: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);

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
          구매까지 이어지는 설득 순서예요. 상품 특성에 맞게 순서를 바꿀 수 있고, 각 단계는 한 장의
          이미지가 됩니다.
        </p>
        <span>생성 전 수정 가능</span>
      </div>
      <ol className="story-order-list" aria-label="설득 흐름 순서">
        {order.map((stage, index) => (
          <li
            key={stage}
            draggable
            onDragStart={() => onDragStart(index)}
            onDragOver={onDragOver}
            onDrop={() => onDrop(index)}
            onDragEnd={() => setDragIndex(null)}
            aria-label={`${index + 1}번 ${STORY_STAGE_LABELS[stage]}`}
          >
            <span className="story-order-handle" aria-hidden="true">
              ⋮⋮
            </span>
            <b>{String(index + 1).padStart(2, "0")}</b>
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
        ))}
      </ol>
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
