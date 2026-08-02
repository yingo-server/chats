import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { registerRoutes } from "./routes.js";
import { startTokenCleaner, resetAllOnline } from "./core.js";
import { waitForDb } from "./db.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import https from "node:https";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "user-service" });

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3000", "http://localhost:9000"];
const CORS_REGEX = /^(https?:\/\/)?([\w-]+\.)?344977\.xyz$/;

const SSL_CERT = process.env.SSL_CERT;
const SSL_KEY = process.env.SSL_KEY;

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL || "info" },
  trustProxy: true,
  bodyLimit: 1024 * 64,
  requestTimeout: 10_000,
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin) || CORS_REGEX.test(origin)) cb(null, true);
    else cb(null, false);
  },
  credentials: true,
});
await app.register(helmet, { contentSecurityPolicy: false });

app.addHook("onRequest", async (req) => {
  if (!req.id) req.id = crypto.randomUUID();
});

await registerRoutes(app);

// ═══ Admin dashboard ═══
const dashboardHtml = readFileSync(join(import.meta.dirname!, "../dashboard/index.html"), "utf-8");
app.get("/admin", async (req, reply) => reply.type("text/html").send(dashboardHtml));

// ═══ Pre-start validation ═══
try {
  await waitForDb(10, 2000);
} catch (e: any) {
  log.fatal({ err: e.message }, "Cannot start without database");
  process.exit(1);
}

await resetAllOnline();
const cleanerTimer = startTokenCleaner();
log.info("Token cleaner started (24h interval)");

// ═══ Shutdown handling (forced exit on timeout) ═══
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down`);
  clearInterval(cleanerTimer);

  const forceExit = setTimeout(() => {
    log.fatal("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 8000);
  forceExit.unref();

  try { await app.close(); } catch (e) { log.error({ err: e }, "Shutdown error"); }
  clearTimeout(forceExit);
  process.exit(0);
}
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => shutdown(sig));
}

process.on("uncaughtException", (e) => { log.fatal({ err: e }, "Uncaught exception"); process.exit(1); });
process.on("unhandledRejection", (e) => { log.fatal({ err: e }, "Unhandled rejection"); process.exit(1); });

if (SSL_CERT && SSL_KEY) {
  try {
    await app.ready();
    const server = https.createServer({ key: readFileSync(SSL_KEY), cert: readFileSync(SSL_CERT) }, (req, res) => app.server.emit("request", req, res));
    await new Promise<void>((resolve) => server.listen(9000, "0.0.0.0", () => resolve()));
    log.info("User Service v1 :9000 (HTTPS)");
  } catch (e: any) {
    log.fatal({ err: e.message }, "HTTPS setup failed, check SSL_CERT/SSL_KEY paths");
    process.exit(1);
  }
} else {
  await app.listen({ port: 9000, host: "0.0.0.0" });
  log.info("User Service v1 :9000 (HTTP)");
}
