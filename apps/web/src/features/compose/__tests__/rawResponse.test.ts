import { describe, expect, it } from "vitest";
import { assertJpegDimensions, decodeRawResponse } from "../rawResponse";
import { wrapLine } from "../layout";

function fakeJpeg(width: number, height: number): Uint8Array {
  // SOI, SOF0(길이 17, 정밀도 8, 높이, 너비, 3컴포넌트), SOS, EOI
  const sof = [
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 0xff,
    width >> 8,
    width & 0xff,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ];
  return new Uint8Array([0xff, 0xd8, ...sof, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
}

describe("assertJpegDimensions", () => {
  it("1024×1536 은 통과한다", () => {
    expect(() => assertJpegDimensions(fakeJpeg(1024, 1536))).not.toThrow();
  });
  it("다른 규격은 RAW_IMAGE_DIMENSIONS", () => {
    expect(() => assertJpegDimensions(fakeJpeg(1024, 1024))).toThrow("RAW_IMAGE_DIMENSIONS");
  });
  it("JPEG 가 아니면 RAW_IMAGE_INVALID", () => {
    expect(() => assertJpegDimensions(new Uint8Array([1, 2, 3, 4]))).toThrow("RAW_IMAGE_INVALID");
  });
});

describe("decodeRawResponse", () => {
  it("OpenAI 응답 JSON 에서 JPEG 바이트를 꺼낸다", () => {
    const b64 = Buffer.from(fakeJpeg(1024, 1536)).toString("base64");
    const bytes = decodeRawResponse(JSON.stringify({ data: [{ b64_json: b64 }] }));
    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
  });
  it("data 가 비어 있으면 RAW_IMAGE_MISSING", () => {
    expect(() => decodeRawResponse(JSON.stringify({ data: [] }))).toThrow("RAW_IMAGE_MISSING");
  });
});

describe("wrapLine", () => {
  const measure = (t: string) => t.length * 10;
  it("공백에서 먼저 끊는다", () => {
    expect(wrapLine("가나다 라마바 사아", 70, measure)).toEqual(["가나다 라마바", "사아"]);
  });
  it("긴 단어는 글자 단위로 끊는다", () => {
    expect(wrapLine("가나다라마바사", 30, measure)).toEqual(["가나다", "라마바", "사"]);
  });
});
