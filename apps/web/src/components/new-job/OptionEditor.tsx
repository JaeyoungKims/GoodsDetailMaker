// 상품 옵션 입력: 옵션명 + 옵션 사진 1장. 입력하면 옵션별 썸네일이 만들어진다
import { useRef, type ChangeEvent } from "react";
import { INPUT_IMAGE_TYPES, OPTION_MAX } from "@gdm/shared";

export interface OptionDraft {
  name: string;
  file: File | null;
}

interface Props {
  options: OptionDraft[];
  onChange: (options: OptionDraft[]) => void;
}

const ACCEPT = INPUT_IMAGE_TYPES.join(",");

export function OptionEditor({ options, onChange }: Props) {
  const pickers = useRef(new Map<number, HTMLInputElement | null>());

  function update(index: number, patch: Partial<OptionDraft>) {
    onChange(options.map((o, i) => (i === index ? { ...o, ...patch } : o)));
  }
  function add() {
    if (options.length >= OPTION_MAX) return;
    onChange([...options, { name: "", file: null }]);
  }
  function remove(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }
  function onPick(index: number, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    update(index, { file });
    event.target.value = "";
  }

  return (
    <div className="option-editor">
      <p className="option-editor__lead">
        색상·용량처럼 고를 수 있는 옵션이 있으면 적어 주세요. 옵션마다 썸네일을 한 장씩 만들고, 그걸
        모아 대표 이미지도 만들어 드려요. 옵션이 없으면 비워 두세요. 그때는 대표 이미지 한 장만
        만듭니다.
      </p>

      {options.length > 0 && (
        <ul className="option-list">
          {options.map((option, index) => (
            <li key={index}>
              <b>{String(index + 1).padStart(2, "0")}</b>
              <input
                type="text"
                value={option.name}
                maxLength={40}
                placeholder="예: 아이보리 / 500ml"
                aria-label={`${index + 1}번 옵션 이름`}
                onChange={(e) => update(index, { name: e.target.value })}
              />
              <button
                type="button"
                className={option.file ? "option-photo is-set" : "option-photo"}
                onClick={() => pickers.current.get(index)?.click()}
              >
                {option.file ? option.file.name.slice(0, 16) : "사진 선택"}
              </button>
              <input
                ref={(el) => {
                  pickers.current.set(index, el);
                }}
                type="file"
                accept={ACCEPT}
                hidden
                onChange={(e) => onPick(index, e)}
              />
              <button
                type="button"
                className="option-remove"
                aria-label={`${index + 1}번 옵션 삭제`}
                onClick={() => remove(index)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        className="option-add"
        disabled={options.length >= OPTION_MAX}
        onClick={add}
      >
        + 옵션 추가 ({options.length}/{OPTION_MAX})
      </button>
      <small className="option-editor__note">
        옵션 사진을 넣지 않으면 위에서 올린 상품 사진으로 만들어요. 옵션 사진은 본문 13장 기획에는
        쓰이지 않아 상품 색이 섞이지 않습니다.
      </small>
    </div>
  );
}
