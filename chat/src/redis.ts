import Redis from "ioredis";
import pino from "pino";

const log = pino({ level: process.env.LOG_LEVEL || "info", name: "chat-redis" });

let instance: Redis | null = null;
export function createClient(): Redis {
  if (!instance) {
    instance = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryStrategy(times: number) {
        // 永不放弃：Redis 故障期间服务降级为纯 DB 模式，恢复后自动续传
        const delay = Math.min(times * 500, 15_000);
        log.warn({ attempt: times, delay }, "Redis: reconnecting");
        return delay;
      },
      reconnectOnError(err) {
        const targetErrors = ["READONLY", "ECONNRESET", "ETIMEDOUT", "EPIPE"];
        const shouldReconnect = targetErrors.some(e => err.message.includes(e));
        if (shouldReconnect) log.warn({ err: err.message }, "Redis: reconnecting on error");
        return shouldReconnect;
      },
      enableReadyCheck: true,
      connectTimeout: 10000,
    });

    instance.on("error", (err) => {
      log.error({ err: err.message }, "Redis connection error");
    });

    instance.on("connect", () => {
      log.info("Redis connected");
    });

    instance.on("reconnecting", (delay: number) => {
      log.info({ delay }, "Redis reconnecting");
    });
  }
  return instance;
}
