import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import { Server } from "socket.io";
import { registerRoutes, setBroadcast } from "./routes.js";
import { verifySocketAuth, setupSocketHandlers } from "./socket.js";
import { startArchiver, db } from "./core.js";
import { createClient } from "./redis.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import https from "node:https";
import pino from "pino";
import { sql } from "drizzle-orm";


const log = pino({ level: process.env.LOG_LEVEL || "info", name: "chat-service" });

const redis = createClient();

// ═══ 启动前校验：等待 Redis + DB ═══
for (let attempt = 1; attempt <= 10; attempt++) {
  try {
    await redis.connect();
    await redis.ping();
    log.info("Redis connection verified");
    break;
  } catch (e: any) {
    log.warn({ attempt, err: e.message }, "Redis not ready, retrying...");
    if (attempt === 10) {
      log.fatal("Redis unreachable after 10 retries");
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

for (let attempt = 1; attempt <= 10; attempt++) {
  try {
    await db.execute(sql`SELECT 1`);
    log.info("Database connection verified");
    break;
  } catch (e: any) {
    log.warn({ attempt, err: e.message }, "DB not ready, retrying...");
    if (attempt === 10) {
      log.fatal("Database unreachable after 10 retries");
      process.exit(1);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
}

const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") || ["http://localhost:3000", "http://localhost:9001"];
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

// ═══ Admin 控制面板 ═══
const dashboardHtml = readFileSync(join(import.meta.dirname!, "../dashboard/index.html"), "utf-8");
app.get("/admin", async (req, reply) => reply.type("text/html").send(dashboardHtml));

// ═══ Socket.IO ═══
await app.ready();

const io = new Server(app.server, {
  cors: { origin: [...ALLOWED_ORIGINS, "https://chats.344977.xyz"] },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.use(async (socket, next) => {
  const token = socket.handshake.auth.token as string;
  try {
    const u = await verifySocketAuth(token);
    if (!u) return next(new Error("unauthorized"));
    socket.data.userId = u.userId;
    socket.data.scopes = u.scopes;
    next();
  } catch (e: any) {
    log.error({ err: e.message }, "Socket auth error");
    next(new Error("unauthorized"));
  }
});

setupSocketHandlers(io);
setBroadcast((roomId, msg) => io.to(roomId).emit("v1:message", msg));

// ═══ 初始化: 用 SCAN 清理旧 online 标记（避免 KEYS 阻塞）═══
try {
  let cursor = "0";
  do {
    const [nextCursor, keys] = await redis.scan(cursor, "MATCH", "online:*", "COUNT", 100);
    cursor = nextCursor;
    if (keys.length > 0) await redis.del(...keys);
  } while (cursor !== "0");
} catch (e: any) {
  log.warn({ err: e.message }, "Failed to cleanup old online keys");
}

const archiverTimer = startArchiver();

// ═══ 关闭处理（带超时强制退出）═══
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}, shutting down`);
  clearInterval(archiverTimer);

  const forceExit = setTimeout(() => {
    log.fatal("Graceful shutdown timed out, forcing exit");
    process.exit(1);
  }, 8000);
  forceExit.unref();

  io.close();
  try { await app.close(); } catch (e) { log.error({ err: e }, "Shutdown error"); }
  try { redis.disconnect(); } catch {}
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
    const httpsServer = https.createServer({ key: readFileSync(SSL_KEY), cert: readFileSync(SSL_CERT) }, (req, res) => {
      app.server.emit("request", req, res);
    });
    io.listen(httpsServer);
    await new Promise<void>((resolve) => httpsServer.listen(9001, "0.0.0.0", () => resolve()));
    log.info("Chat Service v1 :9001 (HTTPS + WebSocket)");
  } catch (e: any) {
    log.fatal({ err: e.message }, "HTTPS setup failed, check SSL_CERT/SSL_KEY paths");
    process.exit(1);
  }
} else {
  await app.listen({ port: 9001, host: "0.0.0.0" });
  log.info("Chat Service v1 :9001 (HTTP + WebSocket)");
}
