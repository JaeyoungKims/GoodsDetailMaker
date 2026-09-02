import { Hono } from "hono";
import type { HonoEnv } from "./env.js";
import { ApiError } from "./lib/errors.js";
import { requireAuth } from "./middleware/auth.js";
import { healthRoutes } from "./routes/health.js";
import { jobRoutes } from "./routes/jobs.js";
import { settingsRoutes } from "./routes/settings.js";

export const app = new Hono<HonoEnv>()
  .basePath("/api")
  .onError((err, c) => {
    if (err instanceof ApiError) {
      return c.json({ error: err.code, ...err.extra }, err.status as 400);
    }
    console.error("unhandled", err);
    return c.json({ error: "INTERNAL_ERROR" }, 500);
  })
  .notFound((c) => c.json({ error: "NOT_FOUND" }, 404))
  .route("/health", healthRoutes)
  .use("/jobs/*", requireAuth)
  .use("/jobs", requireAuth)
  .use("/settings/*", requireAuth)
  .use("/settings", requireAuth)
  .route("/jobs", jobRoutes)
  .route("/settings", settingsRoutes);

export type AppType = typeof app;
