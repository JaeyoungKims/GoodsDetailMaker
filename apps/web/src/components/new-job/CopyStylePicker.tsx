// 문구를 이미지에 얹는 방식 선택. 축소 미리보기 칩으로 고른다
import { COPY_STYLES, COPY_STYLE_META, type CopyStyle } from "@gdm/shared";

interface Props {
  value: CopyStyle;
  onChange: (style: CopyStyle) => void;
}

export function CopyStylePicker({ value, onChange }: Props) {
  const meta = COPY_STYLE_META[value];
  return (
    <div className="field field--wide" role="radiogroup" aria-labelledby="copy-style-label">
      <span id="copy-style-label">
        문구 얹는 방식 <b>모든 장 공통</b>
      </span>
      <div className="copy-style-chips">
        {COPY_STYLES.map((style) => {
          const info = COPY_STYLE_META[style];
          const selected = style === value;
          return (
            <button
              key={style}
              type="button"
              role="radio"
              aria-checked={selected}
              className={selected ? "copy-style-chip is-selected" : "copy-style-chip"}
              onClick={() => onChange(style)}
            >
              <span className="copy-style-chip__preview" aria-hidden="true">
                <span className="copy-style-chip__photo" />
                <span className="copy-style-chip__plate" style={{ background: info.plate }}>
                  <b style={{ background: info.ink }} />
                  <i style={{ background: info.ink }} />
                </span>
              </span>
              <strong>{info.label}</strong>
            </button>
          );
        })}
      </div>
      <small>{meta.description}</small>
    </div>
  );
}
