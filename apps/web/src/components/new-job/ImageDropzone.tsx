import { useRef, useState, type ChangeEvent } from "react";
import {
  ACCEPTED_SNIFFED_TYPES,
  INPUT_IMAGE_MAX,
  describeSniffedType,
  sniffImageType,
} from "@gdm/shared";
import { formatBytes } from "@/features/inputs/normalizeImage";

interface Props {
  files: File[];
  onChange: (files: File[]) => void;
}

/** 상품 기준 이미지 1~5장. 첫 번째가 주력 제품. */
export function ImageDropzone({ files, onChange }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rejected, setRejected] = useState<string | null>(null);

  async function onPick(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []).filter((f) => f.size > 0);
    // 같은 파일을 다시 고를 수 있도록 입력값을 비운다
    event.target.value = "";
    if (picked.length === 0) return;

    // 확장자가 아니라 파일 내용(시그니처)으로 실제 형식을 확인한다
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of picked) {
      const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
      const real = sniffImageType(head);
      if (ACCEPTED_SNIFFED_TYPES.includes(real)) accepted.push(file);
      else problems.push(`${file.name}: 실제 형식이 ${describeSniffedType(real)}입니다`);
    }
    setRejected(
      problems.length ? `${problems.join(" · ")}. JPG·PNG·WebP로 다시 저장해서 올려 주세요.` : null,
    );
    if (accepted.length === 0) return;
    // 기존 목록에 이어 붙이되 한도 초과분은 잘라낸다
    onChange([...files, ...accepted].slice(0, INPUT_IMAGE_MAX));
  }

  function makePrimary(index: number) {
    if (index <= 0) return;
    const next = [...files];
    const [picked] = next.splice(index, 1);
    next.unshift(picked!);
    onChange(next);
  }

  function remove(index: number) {
    onChange(files.filter((_, i) => i !== index));
  }

  return (
    <>
      <label className="upload-dropzone">
        <input
          ref={inputRef}
          type="file"
          name="images"
          accept="image/jpeg,image/png,image/webp"
          multiple
          required={files.length === 0}
          onChange={(e) => void onPick(e)}
          aria-describedby="upload-hint"
        />
        <span className="upload-dropzone__icon" aria-hidden="true">
          ＋
        </span>
        <strong>
          {files.length
            ? `${files.length}장 선택됨 · 더 추가하기`
            : "사진을 끌어다 놓거나 클릭해서 선택"}
        </strong>
        <p id="upload-hint">
          첫 번째 사진이 주력 제품으로 쓰여요. 배경이 깨끗한 정면 컷을 추천합니다.
        </p>
        <small>JPG · PNG · WebP, 장당 10MB, 전체 25MB, 최대 5장</small>
      </label>
      {rejected && (
        <p className="upload-rejected" role="alert">
          {rejected}
        </p>
      )}
      {files.length > 0 && (
        <ul className="selected-files" aria-label="선택한 이미지">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${file.lastModified}-${index}`}
              className={index === 0 ? "is-primary" : undefined}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{file.name}</strong>
                {index === 0 && <b>주력 제품</b>}
              </div>
              <small>{formatBytes(file.size)}</small>
              <div className="selected-files__actions">
                {index > 0 && (
                  <button type="button" onClick={() => makePrimary(index)}>
                    주력으로
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(index)}
                  aria-label={`${file.name} 제거`}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
