import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "user-db" });

if (!process.env.DATABASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("DATABASE_URL must be set in production");
}

const client = postgres(
  process.env.DATABASE_URL || "postgres://yingo:yingo123@localhost:5432/cold_user",
  {
    max: 20,
    idle_timeout: 300,
    connect_timeout: 15,
    max_lifetime: 1800,
    onnotice: () => {},
    onparameter: () => {},
  }
);

export const db = drizzle(client);

export async function waitForDb(retries = 10, delayMs = 2000): Promise<void> {
  for (let i = 0; i < retries; i++) {
    try {
      await client`SELECT 1`;
      log.info("Database connection verified");
      return;
    } catch (e: any) {
      log.warn({ attempt: i + 1, retries, err: e.message }, "DB not ready, retrying...");
      if (i < retries - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw new Error("Database unreachable after " + retries + " retries");
}
