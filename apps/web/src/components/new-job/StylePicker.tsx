import { TONES, TONE_META, type Tone } from "@gdm/shared";

/** 칩에 보여줄 대표 색 3개. 이미지 프롬프트와는 무관한 UI 힌트다. */
const SWATCHES: Record<Tone, [string, string, string]> = {
  warm_lifestyle: ["#f5ead7", "#d9ae7a", "#fffaf0"],
  cinematic: ["#0d1119", "#38516e", "#c18e50"],
  sporty: ["#071d47", "#fa463c", "#f7f9fc"],
  premium_luxury: ["#0b0b0c", "#b4955f", "#171616"],
  clean_minimal: ["#e8ebee", "#a9b2b7", "#fbfbfa"],
  tech_future: ["#061727", "#00c9e8", "#0a1724"],
  natural_organic: ["#e8e3c9", "#779276", "#f3f0e4"],
  bold_pop: ["#ff5a46", "#6a4cdb", "#ffe845"],
};

interface Props {
  value: Tone;
  onChange: (tone: Tone) => void;
}

/** 스타일(tone) 선택: 색상 칩 라디오 그룹 + 선택한 스타일 설명 한 줄 */
export function StylePicker({ value, onChange }: Props) {
  const meta = TONE_META[value];
  return (
    <div className="field field--wide" role="radiogroup" aria-labelledby="tone-label">
      <span id="tone-label">
        상세페이지 스타일 <b>13장 공통</b>
      </span>
      <div className="tone-chips">
        {TONES.map((tone) => {
          const selected = tone === value;
          const [a, b, c] = SWATCHES[tone];
          return (
            <label key={tone} className={selected ? "tone-chip is-selected" : "tone-chip"}>
              <input
                type="radio"
                name="tone"
                value={tone}
                checked={selected}
                onChange={() => onChange(tone)}
              />
              <span className="tone-chip__swatches" aria-hidden="true">
                <i style={{ background: a }} />
                <i style={{ background: b }} />
                <i style={{ background: c }} />
              </span>
              <strong>{TONE_META[tone].label}</strong>
              <small>{TONE_META[tone].keywords}</small>
            </label>
          );
        })}
      </div>
      <p className="tone-description">
        <b>{meta.eyebrow}</b>
        <span>{meta.description}</span>
      </p>
      <small>모든 장의 배경·조명·색감이 이 스타일로 통일됩니다.</small>
    </div>
  );
}
