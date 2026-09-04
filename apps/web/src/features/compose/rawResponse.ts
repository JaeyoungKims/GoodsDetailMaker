import { IMAGE_HEIGHT, IMAGE_WIDTH, RAW_RESPONSE_MAX_BYTES } from "@gdm/shared";

export class ComposeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "ComposeError";
  }
}

const MAX_DECODED_BYTES = 9_000_000;
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * JPEG 마커를 걸어 SOF 세그먼트의 크기가 기대 규격인지 확인한다.
 * 이미지 모델이 규격과 다른 결과를 돌려주면 합성 전에 걸러낸다.
 * 본문은 1024×1536, 썸네일은 1024×1024 라 규격을 인자로 받는다.
 */
export function assertJpegDimensions(
  bytes: Uint8Array,
  expectedWidth: number = IMAGE_WIDTH,
  expectedHeight: number = IMAGE_HEIGHT,
): void {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8)
    throw new ComposeError("RAW_IMAGE_INVALID");
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) throw new ComposeError("RAW_IMAGE_INVALID");
    const marker = bytes[offset + 1]!;
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // 독립 마커(길이 없음)
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9) break;
    const length = (bytes[offset + 2]! << 8) | bytes[offset + 3]!;
    if (length < 2 || offset + 2 + length > bytes.length)
      throw new ComposeError("RAW_IMAGE_INVALID");
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      const height = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      const width = (bytes[offset + 7]! << 8) | bytes[offset + 8]!;
      if (width !== expectedWidth || height !== expectedHeight)
        throw new ComposeError("RAW_IMAGE_DIMENSIONS");
      return;
    }
    if (marker === 0xda) break; // SOS 이후는 엔트로피 데이터
    offset += 2 + length;
  }
  throw new ComposeError("RAW_IMAGE_INVALID");
}

/** OpenAI 이미지 응답 JSON 문자열 → 검증된 JPEG 바이트 */
export function decodeRawResponse(
  text: string,
  expectedWidth: number = IMAGE_WIDTH,
  expectedHeight: number = IMAGE_HEIGHT,
): Uint8Array {
  if (text.length > RAW_RESPONSE_MAX_BYTES) throw new ComposeError("RAW_RESPONSE_INVALID");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ComposeError("RAW_RESPONSE_INVALID");
  }
  const data = (parsed as { data?: unknown } | null)?.data;
  if (!Array.isArray(data) || data.length === 0) throw new ComposeError("RAW_IMAGE_MISSING");
  const b64 = (data[0] as { b64_json?: unknown } | null)?.b64_json;
  if (typeof b64 !== "string" || b64.length === 0) throw new ComposeError("RAW_IMAGE_MISSING");
  if (b64.length % 4 !== 0 || !BASE64_RE.test(b64)) throw new ComposeError("RAW_IMAGE_INVALID");

  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const decodedLength = (b64.length / 4) * 3 - padding;
  if (decodedLength > MAX_DECODED_BYTES) throw new ComposeError("RAW_IMAGE_TOO_LARGE");

  let binary: string;
  try {
    binary = atob(b64);
  } catch {
    throw new ComposeError("RAW_IMAGE_INVALID");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  assertJpegDimensions(bytes, expectedWidth, expectedHeight);
  return bytes;
}
