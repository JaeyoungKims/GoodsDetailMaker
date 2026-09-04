import { useCallback, useRef, useState } from "react";
import {
  INPUT_IMAGE_MAX,
  INPUT_IMAGE_MAX_BYTES,
  INPUT_IMAGE_MIN,
  INPUT_IMAGE_TOTAL_MAX_BYTES,
  INPUT_IMAGE_TYPES,
  OPTION_MAX,
  productBriefSchema,
  type ProductBrief,
  type ProductOption,
} from "@gdm/shared";
import type { OptionDraft } from "@/components/new-job/OptionEditor";
import { normalizeImage } from "@/features/inputs/normalizeImage";
import { jobsApi } from "@/lib/api/jobs";

const IMAGE_TYPE_SET = new Set<string>(INPUT_IMAGE_TYPES);

export const INPUT_RULE_MESSAGE =
  "입력 내용과 이미지(1~5장, JPG·PNG·WebP, 장당 10MB 이하·전체 25MB 이하)를 확인해 주세요.";

/** 제출 1회분 스냅샷. 중간에 실패해도 같은 jobId·inputId 로 이어서 시도한다. */
interface Snapshot {
  jobId: string;
  brief: ProductBrief;
  files: File[];
  inputIds: string[];
  /** 사진이 있는 옵션만. brief.options 의 inputId 와 짝을 이룬다. */
  optionFiles: Array<{ inputId: string; file: File }>;
}

export type CreatePhase = "idle" | "submitting" | "resumable" | "done";

export interface CreateJobState {
  phase: CreatePhase;
  message: string;
}

export interface CreateJobOptions {
  accessToken: string;
  onStarted: (jobId: string) => void;
  uuid?: () => string;
}

/** 이름이 있는 옵션만 남기고 사진에는 업로드용 id 를 붙인다 */
function buildOptions(
  drafts: OptionDraft[],
  uuid: () => string,
): { options: ProductOption[]; optionFiles: Array<{ inputId: string; file: File }> } {
  const options: ProductOption[] = [];
  const optionFiles: Array<{ inputId: string; file: File }> = [];
  for (const draft of drafts.slice(0, OPTION_MAX)) {
    const name = draft.name.trim();
    if (!name) continue;
    if (draft.file && draft.file.size > 0) {
      const inputId = uuid();
      options.push({ name, inputId });
      optionFiles.push({ inputId, file: draft.file });
    } else {
      options.push({ name });
    }
  }
  return { options, optionFiles };
}

export function validateFiles(files: File[]): boolean {
  if (files.length < INPUT_IMAGE_MIN || files.length > INPUT_IMAGE_MAX) return false;
  if (
    files.some((f) => !IMAGE_TYPE_SET.has(f.type) || f.size < 1 || f.size > INPUT_IMAGE_MAX_BYTES)
  ) {
    return false;
  }
  return files.reduce((sum, f) => sum + f.size, 0) <= INPUT_IMAGE_TOTAL_MAX_BYTES;
}

function messageFor(code: string, hasJob: boolean): string {
  switch (code) {
    case "API_KEY_REQUIRED":
      return "먼저 설정에서 본인의 OpenAI API 키를 저장해 주세요.";
    case "JOB_INPUT_BYTES_LIMIT":
      return "상품 이미지는 전체 25MB 이하로 줄여 주세요.";
    case "STORAGE_QUOTA_LIMIT":
      return "저장 공간 한도에 도달했어요. 만료 정리가 끝난 뒤 다시 시도해 주세요.";
    case "INVALID_IMAGE":
      return "사진의 실제 형식이 JPG·PNG·WebP가 아니에요. 다른 형식으로 저장한 뒤 다시 올려 주세요.";
    case "IMAGE_NORMALIZATION_FAILED":
      return "이 사진을 안전한 이미지 형식으로 바꾸지 못했어요. 다른 JPG·PNG·WebP 파일로 다시 시도해 주세요.";
    case "JOB_ACTIVE_LIMIT":
      return "진행 중이거나 작성 중인 작업이 너무 많아요. 기존 작업을 마친 뒤 다시 시도해 주세요.";
    case "JOB_DAILY_LIMIT":
      return "오늘 만들 수 있는 작업 수를 모두 사용했어요. 내일 다시 시도해 주세요.";
    default:
      return hasJob
        ? "처리가 멈췄어요. 같은 내용을 다시 눌러 이어서 시도해 주세요."
        : "처리하지 못했어요. 설정과 입력 내용을 확인한 뒤 다시 시도해 주세요.";
  }
}

/**
 * 새 상세페이지 제출 파이프라인: 검증 → 작업 생성 → 이미지 순차 업로드 → 생성 시작.
 * 실패하면 phase 가 "resumable" 이 되고, 다시 submit 하면 남은 단계부터 이어간다.
 */
export function useCreateJob({
  accessToken,
  onStarted,
  uuid = () => crypto.randomUUID(),
}: CreateJobOptions) {
  const [state, setState] = useState<CreateJobState>({ phase: "idle", message: "" });
  const busy = useRef(false);
  const snapshot = useRef<Snapshot | undefined>(undefined);
  const createdJobId = useRef<string | null>(null);
  const uploaded = useRef(new Set<number>());

  const setMessage = (message: string, phase?: CreatePhase) =>
    setState((prev) => ({ phase: phase ?? prev.phase, message }));

  const submit = useCallback(
    async (input: { brief: unknown; files: File[]; options?: OptionDraft[] }) => {
      if (busy.current || state.phase === "done") return;

      const built = buildOptions(input.options ?? [], uuid);
      const brief = productBriefSchema.safeParse({
        ...(input.brief as Record<string, unknown>),
        options: built.options,
      });
      const files = input.files.filter((f) => f.size > 0);
      if (!brief.success || !validateFiles(files)) {
        setMessage(INPUT_RULE_MESSAGE, "idle");
        return;
      }
      // "이어서 시도" 중이라도 사진이나 내용을 바꿨으면 이전 작업을 버리고 새로 시작한다
      const prev = snapshot.current;
      const sameInput =
        prev !== undefined &&
        JSON.stringify(prev.brief) === JSON.stringify(brief.data) &&
        prev.files.length === files.length &&
        prev.files.every((f, i) => f === files[i]);
      let snap: Snapshot;
      if (prev && sameInput) {
        snap = prev;
      } else {
        snap = {
          jobId: uuid(),
          brief: brief.data,
          files,
          inputIds: files.map(uuid),
          optionFiles: built.optionFiles,
        };
        snapshot.current = snap;
        createdJobId.current = null;
        uploaded.current.clear();
      }

      busy.current = true;
      setState({ phase: "submitting", message: "" });
      try {
        if (!createdJobId.current) {
          setMessage("작업을 만드는 중…");
          createdJobId.current = (await jobsApi.create(accessToken, snap.jobId, snap.brief)).id;
        }
        const jobId = createdJobId.current;
        for (let i = 0; i < snap.files.length; i += 1) {
          if (uploaded.current.has(i)) continue;
          setMessage(`이미지 업로드 중 (${i + 1}/${snap.files.length})…`);
          const original = snap.files[i]!;
          // 변환(회전 보정·축소)은 선택 단계다. 실패하면 원본을 그대로 올린다.
          const upload = await normalizeImage(original).catch((err: unknown) => {
            console.warn(
              "[useCreateJob] normalize skipped, uploading original",
              original.name,
              err,
            );
            return original;
          });
          await jobsApi.upload(accessToken, jobId, snap.inputIds[i]!, upload);
          uploaded.current.add(i);
        }
        for (let i = 0; i < snap.optionFiles.length; i += 1) {
          const key = snap.files.length + i;
          if (uploaded.current.has(key)) continue;
          setMessage(`옵션 사진 업로드 중 (${i + 1}/${snap.optionFiles.length})…`);
          const entry = snap.optionFiles[i]!;
          const upload = await normalizeImage(entry.file).catch(() => entry.file);
          await jobsApi.upload(accessToken, jobId, entry.inputId, upload, "option");
          uploaded.current.add(key);
        }
        setMessage("생성 대기열에 넣는 중…");
        await jobsApi.start(accessToken, jobId);

        snapshot.current = undefined;
        uploaded.current.clear();
        setState({
          phase: "done",
          message: "상세페이지 생성을 시작했어요. 준비되면 알려드릴게요.",
        });
        onStarted(jobId);
      } catch (err) {
        const code = err instanceof Error ? err.message : "";
        setState({
          phase: createdJobId.current ? "resumable" : "idle",
          message: messageFor(code, createdJobId.current !== null),
        });
        if (!createdJobId.current) snapshot.current = undefined;
      } finally {
        busy.current = false;
      }
    },
    [accessToken, onStarted, state.phase, uuid],
  );

  return { state, submit };
}
