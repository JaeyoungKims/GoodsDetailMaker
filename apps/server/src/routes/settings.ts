import { Hono } from "hono";
import { z } from "zod";
import { imageParallelismSchema } from "@gdm/shared";
import type { HonoEnv } from "../context.js";
import { ApiError } from "../lib/errors.js";
import {
  getSettings,
  removeOpenAiKey,
  setImageParallelism,
  storeOpenAiKey,
} from "../services/settings.js";

const keyBody = z.object({ key: z.string().trim().min(20).max(400) });
const speedBody = z.object({ imageParallelism: imageParallelismSchema });

export const settingsRoutes = new Hono<HonoEnv>()
  .get("/", async (c) => c.json(await getSettings(c.get("ctx").sql, c.get("user").id)))
  .put("/openai-key", async (c) => {
    const { sql, config } = c.get("ctx");
    const parsed = keyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("INVALID_API_KEY", 400);
    const { lastFour } = await storeOpenAiKey(
      sql,
      config.APP_SECRET,
      c.get("user").id,
      parsed.data.key,
    );
    return c.json({ stored: true as const, lastFour });
  })
  .delete("/openai-key", async (c) => {
    await removeOpenAiKey(c.get("ctx").sql, c.get("user").id);
    return c.body(null, 204);
  })
  .get("/image-speed", async (c) => {
    const { imageParallelism } = await getSettings(c.get("ctx").sql, c.get("user").id);
    return c.json({ imageParallelism });
  })
  .put("/image-speed", async (c) => {
    const parsed = speedBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("INVALID_IMAGE_PARALLELISM", 400);
    await setImageParallelism(c.get("ctx").sql, c.get("user").id, parsed.data.imageParallelism);
    return c.json({ imageParallelism: parsed.data.imageParallelism });
  });
