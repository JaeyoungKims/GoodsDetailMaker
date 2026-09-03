import { Hono, type Context } from "hono";
import { deleteCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import type { HonoEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import { SESSION_COOKIE, requireAuth } from "../middleware/auth.js";
import {
  hashPassword,
  hashSessionToken,
  newSessionToken,
  verifyPassword,
} from "../services/crypto.js";

const credentials = z.object({
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(200),
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

  .get("/me", requireAuth, (c) => c.json({ user: c.get("user") }));

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
