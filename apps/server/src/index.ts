import { serve } from "@hono/node-server";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import type { AppContext } from "./context.js";
import { createSql } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { loadConfig } from "./env.js";
import { createBoss, startQueues } from "./queue/boss.js";
import { jobEvents } from "./services/events.js";
import { DiskStorage } from "./services/storage.js";

async function main() {
  // apps/server/.env (있으면) → process.env. 이미 설정된 값은 덮어쓰지 않는다.
  const envFile = resolve(process.cwd(), ".env");
  if (existsSync(envFile) && typeof process.loadEnvFile === "function")
    process.loadEnvFile(envFile);
  const config = loadConfig();
  const dataDir = resolve(config.DATA_DIR);
  await mkdir(dataDir, { recursive: true });

  const sql = createSql(config.DATABASE_URL);
  const ran = await runMigrations(sql);
  if (ran.length) console.log(`[db] migrations applied: ${ran.join(", ")}`);

  const ctx: AppContext = {
    config,
    sql,
    storage: new DiskStorage(dataDir),
    boss: createBoss(config.DATABASE_URL),
  };
  await jobEvents.attach(sql);
  await startQueues(ctx);

  const app = createApp(ctx);
  const server = serve({ fetch: app.fetch, port: config.PORT, hostname: "0.0.0.0" }, (info) => {
    console.log(`[server] listening on http://localhost:${info.port} (data: ${dataDir})`);
  });

  const shutdown = async () => {
    console.log("[server] shutting down…");
    server.close();
    await ctx.boss.stop({ graceful: true, timeout: 10_000 }).catch(() => {});
    await sql.end({ timeout: 5 }).catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
