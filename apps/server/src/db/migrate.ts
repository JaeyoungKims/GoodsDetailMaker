import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../env.js";
import { createSql, type Sql } from "./client.js";

/**
 * 단순 마이그레이션 러너. migrations/*.sql 을 파일명 순으로 한 번씩 적용한다.
 * 적용 이력은 schema_migrations 에 남는다. `pnpm --filter @gdm/server migrate`
 */
export async function runMigrations(
  sql: Sql,
  dir = join(dirname(fileURLToPath(import.meta.url)), "migrations"),
) {
  await sql`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`;
  const applied = new Set(
    (await sql<{ name: string }[]>`select name from schema_migrations`).map((r) => r.name),
  );
  const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const body = await readFile(join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into schema_migrations (name) values (${file})`;
    });
    ran.push(file);
  }
  return ran;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  if (typeof process.loadEnvFile === "function") {
    try {
      process.loadEnvFile(".env");
    } catch {
      /* .env 없으면 환경변수만 사용 */
    }
  }
  const config = loadConfig();
  const sql = createSql(config.DATABASE_URL);
  runMigrations(sql)
    .then((ran) => {
      console.log(ran.length ? `applied: ${ran.join(", ")}` : "up to date");
      return sql.end();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
