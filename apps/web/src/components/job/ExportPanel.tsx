export type ExportKind = "zip" | "vertical";

interface Props {
  total: number;
  ready: boolean;
  running: ExportKind | null;
  message: string;
  onExport: (kind: ExportKind) => void;
}

export function ExportPanel({ total, ready, running, message, onExport }: Props) {
  return (
    <section className="export-panel" aria-labelledby="export-title">
      <div>
        <p className="eyebrow">완성본 저장</p>
        <h2 id="export-title">원하는 형태로 내려받으세요</h2>
      </div>
      <div className="export-panel__actions">
        <button type="button" disabled={!ready || running !== null} onClick={() => onExport("zip")}>
          {running === "zip" ? "ZIP 만드는 중…" : `${total}장 ZIP 다운로드`}
        </button>
        <button
          type="button"
          disabled={!ready || running !== null}
          onClick={() => onExport("vertical")}
        >
          {running === "vertical" ? "합본 만드는 중…" : "세로 합본 JPG 다운로드"}
        </button>
      </div>
      {!ready && (
        <p className="export-panel__status" role="status">
          현재 카피가 반영된 미리보기 {total}장을 준비하고 있어요. 완성된 장은 아래에서 개별
          다운로드할 수 있습니다.
        </p>
      )}
      {message && (
        <p className="export-panel__status" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
