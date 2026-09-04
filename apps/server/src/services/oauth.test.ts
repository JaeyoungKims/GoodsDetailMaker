// 소셜 로그인 제공자 활성화 판정과 인가 URL 구성을 검증하는 테스트
import { describe, expect, it } from "vitest";
import { loadConfig } from "../env.js";
import { authorizeUrl, enabledProviders, isProvider, redirectUri } from "./oauth.js";

function config(extra: Record<string, string> = {}) {
  return loadConfig({
    DATABASE_URL: "postgres://localhost:5432/test",
    APP_SECRET: "x".repeat(32),
    ...extra,
  } as NodeJS.ProcessEnv);
}

describe("enabledProviders", () => {
  it("클라이언트가 없으면 아무것도 노출하지 않는다", () => {
    expect(enabledProviders(config())).toEqual([]);
  });

  it("secret 이 필요한 제공자는 id 만으로는 켜지지 않는다", () => {
    expect(enabledProviders(config({ GOOGLE_CLIENT_ID: "id" }))).toEqual([]);
    expect(enabledProviders(config({ NAVER_CLIENT_ID: "id" }))).toEqual([]);
  });

  it("카카오는 secret 이 선택이라 id 만으로 켜진다", () => {
    expect(enabledProviders(config({ KAKAO_CLIENT_ID: "id" }))).toEqual(["kakao"]);
  });

  it(".env 에 빈 값으로 남아 있으면 미설정으로 본다", () => {
    const c = config({ GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", KAKAO_CLIENT_ID: "" });
    expect(enabledProviders(c)).toEqual([]);
  });

  it("id 와 secret 이 모두 있으면 켜진다", () => {
    const c = config({
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gsecret",
      NAVER_CLIENT_ID: "nid",
      NAVER_CLIENT_SECRET: "nsecret",
    });
    expect(enabledProviders(c)).toEqual(["google", "naver"]);
  });
});

describe("redirectUri", () => {
  it("기준 주소의 끝 슬래시를 정리한다", () => {
    expect(redirectUri(config({ PUBLIC_BASE_URL: "https://example.com/" }), "google")).toBe(
      "https://example.com/api/auth/oauth/google/callback",
    );
  });

  it("기본값은 localhost 다", () => {
    expect(redirectUri(config(), "kakao")).toBe(
      "http://localhost:8787/api/auth/oauth/kakao/callback",
    );
  });
});

describe("authorizeUrl", () => {
  it("제공자 콘솔에 등록한 값과 같은 redirect_uri 와 state 를 싣는다", () => {
    const c = config({ GOOGLE_CLIENT_ID: "gid", GOOGLE_CLIENT_SECRET: "gsecret" });
    const url = new URL(authorizeUrl(c, "google", "state-123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("gid");
    expect(url.searchParams.get("state")).toBe("state-123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri(c, "google"));
    expect(url.searchParams.get("scope")).toBe("openid email profile");
  });

  it("네이버는 scope 를 보내지 않는다", () => {
    const c = config({ NAVER_CLIENT_ID: "nid", NAVER_CLIENT_SECRET: "nsecret" });
    expect(new URL(authorizeUrl(c, "naver", "s")).searchParams.has("scope")).toBe(false);
  });

  it("꺼진 제공자는 거부한다", () => {
    expect(() => authorizeUrl(config(), "google", "s")).toThrow("OAUTH_PROVIDER_DISABLED");
  });
});

describe("isProvider", () => {
  it("아는 제공자만 통과시킨다", () => {
    expect(isProvider("google")).toBe(true);
    expect(isProvider("apple")).toBe(false);
  });
});
