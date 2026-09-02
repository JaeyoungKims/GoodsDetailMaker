import { TONES, TONE_META, type Tone } from "@gdm/shared";

interface Props {
  value: Tone;
  onChange: (tone: Tone) => void;
}

/** 스타일(tone) 선택 + CSS 변수로 무드가 바뀌는 프리뷰 */
export function StylePicker({ value, onChange }: Props) {
  const meta = TONE_META[value];
  return (
    <label className="field field--wide style-picker">
      <span>
        상세페이지 스타일 <b>13장 공통</b>
      </span>
      <span className="style-picker__select">
        <select name="tone" value={value} onChange={(e) => onChange(e.currentTarget.value as Tone)}>
          {TONES.map((tone) => (
            <option key={tone} value={tone}>
              {TONE_META[tone].label}
            </option>
          ))}
        </select>
      </span>
      <div className="style-preview" data-style={value} aria-hidden="true">
        <span className="style-preview__art">
          <i />
          <i />
          <i />
        </span>
        <span className="style-preview__copy">
          <small>{meta.eyebrow}</small>
          <strong>{meta.label}</strong>
          <span>{meta.description}</span>
          <em>{meta.keywords}</em>
        </span>
      </div>
      <small>모든 장의 배경·조명·색감이 이 스타일로 통일됩니다.</small>
    </label>
  );
}
