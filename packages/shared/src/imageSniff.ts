/**
 * 파일 시그니처(매직 바이트)로 실제 이미지 형식을 판별한다.
 * 확장자·MIME 은 사용자가 바꿀 수 있지만 시그니처는 내용 그대로다.
 */
export type SniffedImageType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "image/heic"
  | "image/avif"
  | "image/gif"
  | "image/bmp"
  | "image/tiff"
  | "unknown";

const ascii = (bytes: Uint8Array, start: number, len: number) =>
  String.fromCharCode(...bytes.subarray(start, start + len));

export function sniffImageType(bytes: Uint8Array): SniffedImageType {
  if (bytes.length < 12) return "unknown";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && ascii(bytes, 1, 3) === "PNG") return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";
  if (ascii(bytes, 0, 3) === "GIF") return "image/gif";
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) return "image/bmp";
  if (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00)
  ) {
    return "image/tiff";
  }
  if (ascii(bytes, 4, 4) === "ftyp") {
    const brand = ascii(bytes, 8, 4).toLowerCase();
    if (brand.startsWith("avi")) return "image/avif";
    if (brand.startsWith("hei") || brand.startsWith("mif") || brand.startsWith("msf"))
      return "image/heic";
  }
  return "unknown";
}

export const ACCEPTED_SNIFFED_TYPES: readonly SniffedImageType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export function describeSniffedType(type: SniffedImageType): string {
  switch (type) {
    case "image/heic":
      return "HEIC/HEIF (아이폰·갤럭시 원본 형식)";
    case "image/avif":
      return "AVIF";
    case "image/gif":
      return "GIF";
    case "image/bmp":
      return "BMP";
    case "image/tiff":
      return "TIFF";
    case "unknown":
      return "알 수 없는 형식";
    default:
      return type;
  }
}
