import { Hono } from "hono";
import { z } from "zod";
import { imageParallelismSchema } from "@gdm/shared";
import type { HonoEnv } from "../env.js";
import { ApiError } from "../lib/errors.js";
import { createServiceClient } from "../services/supabase.js";
import {
  getSettings,
  removeOpenAiKey,
  setImageParallelism,
  storeOpenAiKey,
} from "../services/settings.js";

const keyBody = z.object({ key: z.string().trim().min(20).max(400) });
const speedBody = z.object({ imageParallelism: imageParallelismSchema });

export const settingsRoutes = new Hono<HonoEnv>()
  /** 현재 설정 요약 (키 마지막 4자리, 동시 생성 수) */
  .get("/", async (c) => {
    const db = createServiceClient(c.env);
    const settings = await getSettings(db, c.get("user").id);
    return c.json(settings);
  })

  .put("/openai-key", async (c) => {
    const parsed = keyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("INVALID_API_KEY", 400);
    const db = createServiceClient(c.env);
    const { lastFour } = await storeOpenAiKey(db, c.get("user").id, parsed.data.key);
    return c.json({ stored: true as const, lastFour });
  })

  .delete("/openai-key", async (c) => {
    const db = createServiceClient(c.env);
    await removeOpenAiKey(db, c.get("user").id);
    return c.body(null, 204);
  })

  .get("/image-speed", async (c) => {
    const db = createServiceClient(c.env);
    const { imageParallelism } = await getSettings(db, c.get("user").id);
    return c.json({ imageParallelism });
  })

  .put("/image-speed", async (c) => {
    const parsed = speedBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) throw new ApiError("INVALID_IMAGE_PARALLELISM", 400);
    const db = createServiceClient(c.env);
    await setImageParallelism(db, c.get("user").id, parsed.data.imageParallelism);
    return c.json({ imageParallelism: parsed.data.imageParallelism });
  });
