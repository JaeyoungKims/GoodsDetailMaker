import { describe, expect, it } from "vitest";
import { sniffImageType } from "../imageSniff.js";

const bytes = (...parts: Array<number | string>) =>
  new Uint8Array(
    parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : [p])),
  );

describe("sniffImageType", () => {
  it("JPEG/PNG/WebP 를 시그니처로 구분한다", () => {
    expect(sniffImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0))).toBe(
      "image/jpeg",
    );
    expect(sniffImageType(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0))).toBe(
      "image/png",
    );
    expect(sniffImageType(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe("image/webp");
  });
  it("확장자만 jpg 인 HEIC/AVIF 를 잡아낸다", () => {
    expect(sniffImageType(bytes(0, 0, 0, 0x18, "ftyp", "heic"))).toBe("image/heic");
    expect(sniffImageType(bytes(0, 0, 0, 0x1c, "ftyp", "avif"))).toBe("image/avif");
  });
  it("짧거나 모르는 내용은 unknown", () => {
    expect(sniffImageType(bytes(1, 2, 3))).toBe("unknown");
    expect(sniffImageType(bytes("hello world!"))).toBe("unknown");
  });
});
