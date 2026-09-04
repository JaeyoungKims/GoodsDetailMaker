import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { PASSWORD_MIN_LENGTH } from "@gdm/shared";
import type { HonoEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import { SESSION_COOKIE, requireAuth } from "../middleware/auth.js";
import {
  applyReset,
  issueResetLink,
  listIdentities,
  resolveOAuthLogin,
  unlinkIdentity,
} from "../services/accounts.js";
import {
  hashPassword,
  hashSessionToken,
  newSessionToken,
  verifyPassword,
} from "../services/crypto.js";
import {
  authorizeUrl,
  enabledProviders,
  fetchProfile,
  isProvider,
  safeNext,
} from "../services/oauth.js";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
});

/**
 * 이메일+비밀번호 로그인. 세션은 DB 에, 브라우저에는 HttpOnly 쿠키.
 * 소셜 로그인(google/naver/kakao)은 user_identities 에 연결하는 형태로 추후 추가.
 */
export const authRoutes = new Hono<HonoEnv>()
  .post("/signup", async (c) => {
    const { sql, config } = c.get("ctx");
    if (!config.ALLOW_SIGNUP) throw new ApiError("SIGNUP_DISABLED", 403);
    const body = credentials.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("INVALID_CREDENTIALS", 400);

    const [count] = await sql<{ n: number }[]>`select count(*)::int as n from users`;
    const role = (count?.n ?? 0) === 0 ? "admin" : "user"; // 첫 계정이 관리자
    const [user] = await sql<{ id: string; email: string; role: "user" | "admin" }[]>`
      insert into users (email, password_hash, role)
      values (${body.data.email}, ${hashPassword(body.data.password)}, ${role})
      on conflict (email) do nothing
      returning id, email, role`;
    if (!user) throw new ApiError("EMAIL_TAKEN", 409);
    await issueSession(c, user.id);
    return c.json({ user }, 201);
  })

  .post("/login", async (c) => {
    const { sql } = c.get("ctx");
    const body = credentials.safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("INVALID_CREDENTIALS", 400);
    const [user] = await sql<
      { id: string; email: string; role: "user" | "admin"; password_hash: string | null }[]
    >`
      select id, email, role, password_hash from users where email = ${body.data.email}`;
    if (!user?.password_hash || !verifyPassword(body.data.password, user.password_hash)) {
      throw new ApiError("INVALID_CREDENTIALS", 401);
    }
    await issueSession(c, user.id);
    return c.json({ user: { id: user.id, email: user.email, role: user.role } });
  })

  .post("/logout", requireAuth, async (c) => {
    const { sql } = c.get("ctx");
    await sql`delete from sessions where id = ${c.get("sessionId")}`;
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 204);
  })

  .get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))

  /** 로그인 화면이 어떤 소셜 버튼을 보여줄지 결정한다 */
  .get("/providers", (c) => c.json({ providers: enabledProviders(c.get("ctx").config) }))

  .get("/oauth/:provider", (c) => {
    const { config } = c.get("ctx");
    const provider = c.req.param("provider");
    if (!isProvider(provider)) throw new ApiError("OAUTH_PROVIDER_DISABLED", 404);
    const state = newSessionToken();
    setCookie(c, OAUTH_COOKIE, `${state}:${encodeURIComponent(safeNext(c.req.query("next")))}`, {
      path: "/api/auth",
      httpOnly: true,
      sameSite: "Lax",
      secure: config.NODE_ENV === "production" && c.req.url.startsWith("https://"),
      maxAge: 600,
    });
    return c.redirect(authorizeUrl(config, provider, state));
  })

  .get("/oauth/:provider/callback", async (c) => {
    const { sql, config } = c.get("ctx");
    const stored = getCookie(c, OAUTH_COOKIE) ?? "";
    deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });
    const separator = stored.indexOf(":");
    const expectedState = separator < 0 ? stored : stored.slice(0, separator);
    const next = separator < 0 ? "/" : safeNext(decodeURIComponent(stored.slice(separator + 1)));

    // 사용자가 제공자 화면에서 취소한 경우. 오류로 다루지 않고 그냥 돌려보낸다.
    if (c.req.query("error")) return c.redirect(next);

    const provider = c.req.param("provider");
    const code = c.req.query("code") ?? "";
    const state = c.req.query("state") ?? "";
    try {
      if (!isProvider(provider)) throw new ApiError("OAUTH_PROVIDER_DISABLED", 404);
      if (!code || !state || !expectedState || state !== expectedState)
        throw new ApiError("OAUTH_STATE_INVALID", 400);
      const profile = await fetchProfile(config, provider, code, state);
      const userId = await resolveOAuthLogin(sql, config, provider, profile, await sessionUser(c));
      await issueSession(c, userId);
      return c.redirect(next);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : "INTERNAL_ERROR";
      if (!(err instanceof ApiError)) console.error("[oauth] callback failed", err);
      return c.redirect(`${next}${next.includes("?") ? "&" : "?"}authError=${code}`);
    }
  })

  .get("/identities", requireAuth, async (c) =>
    c.json({ identities: await listIdentities(c.get("ctx").sql, c.get("user").id) }),
  )

  .delete("/identities/:provider", requireAuth, async (c) => {
    const provider = c.req.param("provider");
    if (!isProvider(provider)) throw new ApiError("IDENTITY_NOT_FOUND", 404);
    await unlinkIdentity(c.get("ctx").sql, c.get("user").id, provider);
    return c.body(null, 204);
  })

  /** 관리자가 재설정 링크를 만들어 사용자에게 직접 전달한다 (메일 발송 없음) */
  .post("/reset-links", requireAuth, async (c) => {
    const { sql, config } = c.get("ctx");
    const admin = c.get("user");
    if (admin.role !== "admin") throw new ApiError("FORBIDDEN", 403);
    const body = z
      .object({ email: z.string().trim().toLowerCase().email().max(200) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("USER_NOT_FOUND", 404);
    return c.json(await issueResetLink(sql, config, body.data.email, admin.id));
  })

  .post("/reset", async (c) => {
    const { sql, config } = c.get("ctx");
    const body = z
      .object({
        token: z.string().min(1).max(400),
        password: z.string().min(PASSWORD_MIN_LENGTH).max(200),
      })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success) throw new ApiError("INVALID_CREDENTIALS", 400);
    await applyReset(sql, config, body.data.token, body.data.password);
    return c.body(null, 204);
  });

const OAUTH_COOKIE = "gdm_oauth_state";

/** 로그인 상태에서 소셜 연결을 시도한 경우를 위해, 실패해도 예외를 던지지 않고 읽는다 */
async function sessionUser(c: Context<HonoEnv>): Promise<string | null> {
  const { sql, config } = c.get("ctx");
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const [row] = await sql<{ user_id: string }[]>`
    select user_id from sessions where id = ${hashSessionToken(config.APP_SECRET, token)}
       and expires_at > now()`;
  return row?.user_id ?? null;
}

async function issueSession(c: Context<HonoEnv>, userId: string) {
  const { sql, config } = c.get("ctx");
  const token = newSessionToken();
  const expires = new Date(Date.now() + config.SESSION_DAYS * 24 * 60 * 60 * 1000);
  await sql`insert into sessions (id, user_id, expires_at, user_agent)
            values (${hashSessionToken(config.APP_SECRET, token)}, ${userId}, ${expires}, ${c.req.header("user-agent") ?? null})`;
  setCookie(c, SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "Lax",
    secure: config.NODE_ENV === "production" && c.req.url.startsWith("https://"),
    expires,
  });
}
