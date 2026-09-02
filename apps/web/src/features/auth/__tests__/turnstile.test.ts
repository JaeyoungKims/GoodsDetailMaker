import { describe, expect, it } from "vitest";
import { resolveSiteKey } from "../turnstile";

describe("resolveSiteKey", () => {
  it("운영 형식 키는 그대로 돌려준다", () => {
    expect(resolveSiteKey("0x4AAAAAAAAAAAAAAAAAAAAAAA", false)).toBe("0x4AAAAAAAAAAAAAAAAAAAAAAA");
  });
  it("테스트 키는 개발 모드에서만 허용한다", () => {
    expect(resolveSiteKey("1x00000000000000000000AA", true)).toBe("1x00000000000000000000AA");
    expect(resolveSiteKey("1x00000000000000000000AA", false)).toBeNull();
  });
  it("비어 있거나 형식이 틀리면 null", () => {
    expect(resolveSiteKey(undefined, false)).toBeNull();
    expect(resolveSiteKey("  ", false)).toBeNull();
    expect(resolveSiteKey("abc", false)).toBeNull();
  });
});
