import { Hono } from "hono";
import type { HonoEnv } from "../env.js";

export const healthRoutes = new Hono<HonoEnv>().get("/", (c) =>
  c.json({ ok: true, env: c.env.APP_ENV, time: new Date().toISOString() }),
);
