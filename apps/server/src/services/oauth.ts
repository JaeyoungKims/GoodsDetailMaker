// 소셜 로그인 제공자(구글·카카오·네이버) 정의와 인가 코드 → 프로필 교환
import { z } from "zod";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@gdm/shared";
import type { AppConfig } from "../env.js";
import { ApiError } from "../lib/errors.js";

/** 제공자가 알려준 계정 정보. 이메일이 없거나 미검증인 경우가 있어 구분해서 담는다. */
export interface OAuthProfile {
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  displayName: string | null;
}

interface ProviderDef {
  authorizeUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string | null;
  /** 카카오는 client secret 사용이 선택이라 없어도 동작한다 */
  secretRequired: boolean;
  clientId: (c: AppConfig) => string | undefined;
  clientSecret: (c: AppConfig) => string | undefined;
  parseProfile: (raw: unknown) => OAuthProfile | null;
}

const googleUser = z.object({
  sub: z.string().min(1),
  email: z.string().optional(),
  email_verified: z.boolean().optional(),
  name: z.string().optional(),
});

const kakaoUser = z.object({
  id: z.union([z.number(), z.string()]),
  kakao_account: z
    .object({
      email: z.string().optional(),
      is_email_verified: z.boolean().optional(),
      profile: z.object({ nickname: z.string().optional() }).optional(),
    })
    .optional(),
});

const naverUser = z.object({
  response: z.object({
    id: z.string().min(1),
    email: z.string().optional(),
    name: z.string().optional(),
    nickname: z.string().optional(),
  }),
});

const PROVIDERS: Record<OAuthProvider, ProviderDef> = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    userInfoUrl: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    secretRequired: true,
    clientId: (c) => c.GOOGLE_CLIENT_ID,
    clientSecret: (c) => c.GOOGLE_CLIENT_SECRET,
    parseProfile: (raw) => {
      const p = googleUser.safeParse(raw);
      if (!p.success) return null;
      return {
        providerUserId: p.data.sub,
        email: p.data.email ?? null,
        emailVerified: p.data.email_verified === true,
        displayName: p.data.name ?? null,
      };
    },
  },
  kakao: {
    authorizeUrl: "https://kauth.kakao.com/oauth/authorize",
    tokenUrl: "https://kauth.kakao.com/oauth/token",
    userInfoUrl: "https://kapi.kakao.com/v2/user/me",
    scope: "account_email profile_nickname",
    secretRequired: false,
    clientId: (c) => c.KAKAO_CLIENT_ID,
    clientSecret: (c) => c.KAKAO_CLIENT_SECRET,
    parseProfile: (raw) => {
      const p = kakaoUser.safeParse(raw);
      if (!p.success) return null;
      const account = p.data.kakao_account;
      return {
        providerUserId: String(p.data.id),
        email: account?.email ?? null,
        emailVerified: account?.is_email_verified === true,
        displayName: account?.profile?.nickname ?? null,
      };
    },
  },
  naver: {
    authorizeUrl: "https://nid.naver.com/oauth2.0/authorize",
    tokenUrl: "https://nid.naver.com/oauth2.0/token",
    userInfoUrl: "https://openapi.naver.com/v1/nid/me",
    scope: null,
    secretRequired: true,
    clientId: (c) => c.NAVER_CLIENT_ID,
    clientSecret: (c) => c.NAVER_CLIENT_SECRET,
    parseProfile: (raw) => {
      const p = naverUser.safeParse(raw);
      if (!p.success) return null;
      // 네이버는 이메일 검증 여부를 주지 않는다. 미검증으로 보고 기존 계정 자동 연결을 막는다.
      return {
        providerUserId: p.data.response.id,
        email: p.data.response.email ?? null,
        emailVerified: false,
        displayName: p.data.response.name ?? p.data.response.nickname ?? null,
      };
    },
  },
};

/**
 * 로그인 후 돌아갈 앱 내부 경로만 통과시킨다 (열린 리다이렉트 방지).
 * http 스킴에서는 역슬래시가 슬래시로 정규화되므로 `/\evil.com` 도 외부 주소가 된다.
 * 문자열 검사 대신 실제로 파싱해 origin 이 바뀌는지 본다.
 */
export function safeNext(value: string | undefined): string {
  if (!value || !value.startsWith("/")) return "/";
  const base = "http://internal.invalid";
  try {
    const url = new URL(value, base);
    if (url.origin !== base) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function isProvider(value: string): value is OAuthProvider {
  return (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** client id(필요하면 secret 까지) 가 채워진 제공자만 쓸 수 있다 */
export function enabledProviders(config: AppConfig): OAuthProvider[] {
  return OAUTH_PROVIDERS.filter((name) => {
    const def = PROVIDERS[name];
    if (!def.clientId(config)) return false;
    return def.secretRequired ? Boolean(def.clientSecret(config)) : true;
  });
}

/** 콜백 주소는 제공자 콘솔에 등록한 값과 정확히 같아야 한다 */
export function redirectUri(config: AppConfig, provider: OAuthProvider): string {
  return `${config.PUBLIC_BASE_URL.replace(/\/+$/, "")}/api/auth/oauth/${provider}/callback`;
}

export function authorizeUrl(config: AppConfig, provider: OAuthProvider, state: string): string {
  const def = requireEnabled(config, provider);
  const url = new URL(def.authorizeUrl);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", def.clientId(config) as string);
  url.searchParams.set("redirect_uri", redirectUri(config, provider));
  url.searchParams.set("state", state);
  if (def.scope) url.searchParams.set("scope", def.scope);
  return url.toString();
}

/** 인가 코드를 액세스 토큰으로 바꾸고 프로필까지 읽어 온다 */
export async function fetchProfile(
  config: AppConfig,
  provider: OAuthProvider,
  code: string,
  state: string,
): Promise<OAuthProfile> {
  const def = requireEnabled(config, provider);

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: def.clientId(config) as string,
    redirect_uri: redirectUri(config, provider),
    code,
    state,
  });
  const secret = def.clientSecret(config);
  if (secret) form.set("client_secret", secret);

  const tokenResponse = await fetch(def.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  }).catch(() => null);
  if (!tokenResponse?.ok) {
    console.error(
      `[oauth] ${provider} token exchange failed:`,
      tokenResponse
        ? `HTTP ${tokenResponse.status} ${await tokenResponse.text()}`
        : "network error",
    );
    throw new ApiError("OAUTH_EXCHANGE_FAILED", 502);
  }
  const token = z
    .object({ access_token: z.string().min(1) })
    .safeParse(await tokenResponse.json().catch(() => null));
  if (!token.success) throw new ApiError("OAUTH_EXCHANGE_FAILED", 502);

  const userResponse = await fetch(def.userInfoUrl, {
    headers: { Authorization: `Bearer ${token.data.access_token}` },
  }).catch(() => null);
  if (!userResponse?.ok) {
    console.error(
      `[oauth] ${provider} userinfo failed:`,
      userResponse ? `HTTP ${userResponse.status}` : "network error",
    );
    throw new ApiError("OAUTH_EXCHANGE_FAILED", 502);
  }
  const profile = def.parseProfile(await userResponse.json().catch(() => null));
  if (!profile) throw new ApiError("OAUTH_EXCHANGE_FAILED", 502);
  return profile;
}

function requireEnabled(config: AppConfig, provider: OAuthProvider): ProviderDef {
  if (!enabledProviders(config).includes(provider))
    throw new ApiError("OAUTH_PROVIDER_DISABLED", 404);
  return PROVIDERS[provider];
}
