import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { AppContext, HonoEnv } from "./context.js";
import { ApiError } from "./lib/errors.js";
import { requireAuth } from "./middleware/auth.js";
import { authRoutes } from "./routes/auth.js";
import { eventRoutes } from "./routes/events.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { settingsRoutes } from "./routes/settings.js";

export function createApp(ctx: AppContext) {
  const api = new Hono<HonoEnv>()
    .use("*", async (c, next) => {
      c.set("ctx", ctx);
      await next();
    })
    .onError((err, c) => {
      if (err instanceof ApiError)
        return c.json({ error: err.code, ...err.extra }, err.status as 400);
      console.error("[api] unhandled", err);
      return c.json({ error: "INTERNAL_ERROR" }, 500);
    })
    .notFound((c) => c.json({ error: "NOT_FOUND" }, 404))
    .route("/health", healthRoutes)
    .route("/auth", authRoutes)
    .use("/jobs", requireAuth)
    .use("/jobs/*", requireAuth)
    .use("/settings", requireAuth)
    .use("/settings/*", requireAuth)
    .route("/jobs", eventRoutes)
    .route("/jobs", jobRoutes)
    .route("/settings", settingsRoutes);

  const app = new Hono().route("/api", api);

  // SPA 정적 파일: 빌드 결과가 있으면 서빙하고, 없는 경로는 index.html 로 (클라이언트 라우팅)
  const dist = ctx.config.WEB_DIST;
  if (existsSync(join(dist, "index.html"))) {
    app.use("/*", serveStatic({ root: dist }));
    app.get("*", serveStatic({ root: dist, path: "index.html" }));
  } else {
    app.get("*", (c) =>
      c.text("web build not found. run `pnpm --filter @gdm/web build` or set WEB_DIST", 404),
    );
  }
  return app;
}
