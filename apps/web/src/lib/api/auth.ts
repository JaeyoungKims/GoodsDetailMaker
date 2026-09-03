import { z } from "zod";
import { ApiRequestError } from "./http";

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string(),
  role: z.enum(["user", "admin"]),
});
export type AuthUser = z.infer<typeof userSchema>;

async function call(path: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(path, { credentials: "include", ...init });
  } catch {
    throw new ApiRequestError("JOB_REQUEST_FAILED");
  }
  if (response.status === 204) return null;
  const body = (await response.json().catch(() => null)) as {
    error?: string;
    user?: unknown;
  } | null;
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
};
