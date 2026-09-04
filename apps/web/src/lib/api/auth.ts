import { z } from "zod";
import { OAUTH_PROVIDERS, type OAuthProvider } from "@gdm/shared";
import { ApiRequestError } from "./http";

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(["user", "admin"]),
});
export type AuthUser = z.infer<typeof userSchema>;

const identitySchema = z.object({ provider: z.string(), createdAt: z.string() });
export type LinkedIdentity = z.infer<typeof identitySchema>;

const resetLinkSchema = z.object({ url: z.string(), expiresAt: z.string() });
export type ResetLink = z.infer<typeof resetLinkSchema>;

async function call(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new ApiRequestError("JOB_REQUEST_FAILED");
  }
  if (response.status === 204) return null;
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok)
    throw new ApiRequestError((body?.error as never) ?? "JOB_REQUEST_FAILED", response.status);
  return body;
}

/** 쿠키 세션 기반 인증 API */
export const authApi = {
  async me(): Promise<AuthUser | null> {
    try {
      const body = await call("/api/auth/me");
      const parsed = userSchema.safeParse(body?.user);
      return parsed.success ? parsed.data : null;
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) return null;
      throw err;
    }
  },
  async login(email: string, password: string): Promise<AuthUser> {
    const body = await call("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return userSchema.parse(body?.user);
  },
  async signup(email: string, password: string): Promise<AuthUser> {
    const body = await call("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    return userSchema.parse(body?.user);
  },
  async logout(): Promise<void> {
    await call("/api/auth/logout", { method: "POST" });
  },

  /** 서버에 클라이언트가 설정된 소셜 제공자만 돌아온다 */
  async providers(): Promise<OAuthProvider[]> {
    const body = await call("/api/auth/providers");
    const parsed = z.array(z.enum(OAUTH_PROVIDERS)).safeParse(body?.providers);
    return parsed.success ? parsed.data : [];
  },

  async identities(): Promise<LinkedIdentity[]> {
    const body = await call("/api/auth/identities");
    const parsed = z.array(identitySchema).safeParse(body?.identities);
    return parsed.success ? parsed.data : [];
  },

  async unlinkIdentity(provider: OAuthProvider): Promise<void> {
    await call(`/api/auth/identities/${provider}`, { method: "DELETE" });
  },

  /** 관리자 전용. 만들어진 링크는 관리자가 사용자에게 직접 전달한다. */
  async issueResetLink(email: string): Promise<ResetLink> {
    const body = await call("/api/auth/reset-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    return resetLinkSchema.parse(body);
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await call("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
  },
};
