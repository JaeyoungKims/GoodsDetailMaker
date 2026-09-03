import type { PgBoss } from "pg-boss";
import type { Sql } from "./db/client.js";
import type { AppConfig } from "./env.js";
import type { DiskStorage } from "./services/storage.js";

/** 앱 전체가 공유하는 의존성 묶음 */
export interface AppContext {
  config: AppConfig;
  sql: Sql;
  storage: DiskStorage;
  boss: PgBoss;
}

export interface AuthUser {
  id: string;
  email: string;
  role: "user" | "admin";
}

export type HonoEnv = {
  Variables: { ctx: AppContext; user: AuthUser; sessionId: string };
};
