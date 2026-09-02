import { app } from "./app.js";
import type { AppEnv } from "./env.js";
import { cleanupExpiredJobs } from "./queue/cleanup.js";
import { handleQueueBatch } from "./queue/consumer.js";

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
  queue: (batch, env) => handleQueueBatch(batch, env),
  scheduled: (_event, env, ctx) => {
    ctx.waitUntil(cleanupExpiredJobs(env));
  },
} satisfies ExportedHandler<AppEnv>;
