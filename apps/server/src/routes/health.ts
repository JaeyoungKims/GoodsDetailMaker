import { Hono } from "hono";
import type { HonoEnv } from "../context.js";

export const healthRoutes = new Hono<HonoEnv>().get("/", async (c) => {
  const { sql, config } = c.get("ctx");
  let db = "ok";
  try {
    await sql`select 1`;
  } catch {
    db = "down";
  }
  return c.json({ ok: db === "ok", env: config.NODE_ENV, db, time: new Date().toISOString() });
});
