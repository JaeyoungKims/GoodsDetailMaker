import { createMiddleware } from "hono/factory";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { HonoEnv } from "../env.js";
import { ApiError } from "../lib/errors.js";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function jwks(supabaseUrl: string) {
  let set = jwksCache.get(supabaseUrl);
  if (!set) {
    set = createRemoteJWKSet(new URL("/auth/v1/.well-known/jwks.json", supabaseUrl));
    jwksCache.set(supabaseUrl, set);
  }
  return set;
}

/**
 * Supabase 액세스 토큰 검증.
 * - 신규 프로젝트: 비대칭 키(ES256/RS256) → JWKS
 * - 레거시 프로젝트: SUPABASE_JWT_SECRET(HS256)
 */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new ApiError("UNAUTHENTICATED", 401);

  const issuer = new URL("/auth/v1", c.env.SUPABASE_URL).toString();
  let payload: JWTPayload;
  try {
    const secret = c.env.SUPABASE_JWT_SECRET;
    const result = secret
      ? await jwtVerify(token, new TextEncoder().encode(secret), { issuer })
      : await jwtVerify(token, jwks(c.env.SUPABASE_URL), { issuer });
    payload = result.payload;
  } catch {
    throw new ApiError("UNAUTHENTICATED", 401);
  }

  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    throw new ApiError("UNAUTHENTICATED", 401);
  }
  c.set("user", {
    id: payload.sub,
    email: typeof payload["email"] === "string" ? payload["email"] : null,
  });
  c.set("accessToken", token);
  await next();
});
