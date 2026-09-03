import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { HonoEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import { hashSessionToken } from "../services/crypto.js";

export const SESSION_COOKIE = "gdm_session";

/** 쿠키의 세션 토큰을 해시해 sessions 테이블과 대조한다. 만료된 세션은 지운다. */
export const requireAuth = createMiddleware<HonoEnv>(async (c, next) => {
  const { sql, config } = c.get("ctx");
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new ApiError("UNAUTHENTICATED", 401);
  const id = hashSessionToken(config.APP_SECRET, token);
  const [row] = await sql<
    {
      session_id: string;
      user_id: string;
      email: string;
      role: "user" | "admin";
      expires_at: Date;
    }[]
  >`
    select s.id as session_id, u.id as user_id, u.email, u.role, s.expires_at
      from sessions s join users u on u.id = s.user_id
     where s.id = ${id}`;
  if (!row || row.expires_at.getTime() < Date.now()) {
    if (row) await sql`delete from sessions where id = ${row.session_id}`;
    throw new ApiError("UNAUTHENTICATED", 401);
  }
  // 하루에 한 번 정도만 last_seen 갱신 (쓰기 줄이기)
  void sql`update sessions set last_seen = now() where id = ${row.session_id} and last_seen < now() - interval '1 hour'`.catch(
    () => {},
  );
  c.set("user", { id: row.user_id, email: row.email, role: row.role });
  c.set("sessionId", row.session_id);
  await next();
});
