// 마켓 목록에 걸리는 정사각 썸네일(메인 1 + 옵션 N)의 도메인 스키마
import { z } from "zod";
import { OPTION_MAX } from "../constants.js";
import { SECTION_ERROR_CODES } from "../errors.js";
import { sectionStatusSchema } from "./section.js";

/** main = 옵션 여럿을 한 장에, option = 옵션 하나씩 */
export const thumbnailKindSchema = z.enum(["main", "option"]);
export type ThumbnailKind = z.infer<typeof thumbnailKindSchema>;

/** 메인은 0, 옵션은 1..OPTION_MAX. (kind, optionIndex) 가 한 작업 안에서 유일하다. */
export const thumbnailIndexSchema = z.number().int().min(0).max(OPTION_MAX);

/** 메인 썸네일을 만드는 방법. grid 는 브라우저 합성이라 서버 행이 필요 없다. */
export const mainThumbnailModeSchema = z.enum(["grid", "ai"]);
export type MainThumbnailMode = z.infer<typeof mainThumbnailModeSchema>;

export const thumbnailSchema = z.object({
  kind: thumbnailKindSchema,
  optionIndex: thumbnailIndexSchema,
  /** 옵션명. 메인은 빈 문자열 */
  name: z.string().max(40),
  status: sectionStatusSchema,
  errorCode: z.enum(SECTION_ERROR_CODES).nullable(),
  errorDetail: z.string().max(500).nullable().optional(),
});
export type Thumbnail = z.infer<typeof thumbnailSchema>;

/** 썸네일 배열: 옵션을 넣지 않은 작업은 빈 배열이다 */
export const thumbnailListSchema = z.array(thumbnailSchema).max(OPTION_MAX + 1);

export const thumbnailQueuedSchema = z.object({
  queued: z.literal(true),
  kind: thumbnailKindSchema,
  optionIndex: thumbnailIndexSchema,
});
