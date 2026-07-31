# Yingo Server

实时聊天后端系统，微服务架构。Fastify + Socket.IO + PostgreSQL + Redis。

## 服务

| 服务 | 端口 | 职责 |
|------|------|------|
| `user/` | 9000 | 用户注册、登录、Token、权限管理 |
| `chat/` | 9001 | 实时消息、房间、WebSocket |
| `frontend/` | - | 静态前端 SPA (Netlify) |
| `debug/` | - | Python 集成测试框架 |

## 技术栈

- **运行时**: Node.js 22+
- **框架**: Fastify 5
- **ORM**: Drizzle ORM
- **数据库**: PostgreSQL 16 + Redis 7
- **实时通信**: Socket.IO 4
- **语言**: TypeScript (ES2022, 严格模式)
- **测试**: Vitest (单元) + Python requests/socketio (集成)

## 代码结构

```
user/src/                          chat/src/
├── index.ts   — 服务启动          ├── index.ts    — 服务启动+Socket.IO
├── routes.ts  — REST 路由         ├── routes.ts   — REST 路由
├── core.ts    — 业务逻辑          ├── core.ts     — 消息/房间业务逻辑
├── db.ts      — 数据库连接        ├── api.ts      — User Service 调用隔离
├── schema.ts  — 表定义            ├── socket.ts   — WebSocket 事件处理
├── types.ts   — 类型定义          ├── redis.ts    — Redis 连接
└── debug-config.ts               ├── schema.ts   — 表定义
                                  ├── types.ts    — 类型定义
                                  └── debug-config.ts
```

**依赖关系**: Chat 服务仅通过 `api.ts` 调用 User Service，完全隔离。

## 快速开始

### 环境要求

- Node.js 22+
- PostgreSQL 16+ (数据库: `cold_user`, `cold_chat`)
- Redis 7+

### 本地开发

```bash
# 安装依赖
cd user && npm install
cd ../chat && npm install

# 同步数据库
cd user && npx drizzle-kit push
cd ../chat && npx drizzle-kit push

# 启动服务
cd user && npx tsx src/index.ts   # :9000
cd chat && npx tsx src/index.ts   # :9001
```

### Docker

```bash
cd user && docker compose up -d
cd ../chat && docker compose up -d
```

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `DATABASE_URL` | `postgres://yingo:yingo123@localhost:5432/cold_user` | PostgreSQL 连接串 |
| `REDIS_URL` | `redis://localhost:6379` | Redis 连接串 (仅 Chat) |
| `USER_SERVICE_URL` | `http://localhost:9000` | User Service 地址 (仅 Chat) |
| `PEPPER_SECRET` | `dev-pepper-change-in-production` | 密码 Pepper |
| `TOKEN_SECRET` | `dev-token-secret-change-in-production` | Token HMAC 密钥 |
| `CORS_ORIGINS` | `http://localhost:3000` | CORS 白名单 (逗号分隔) |
| `LOG_LEVEL` | `info` | 日志级别 |
| `SSL_CERT` / `SSL_KEY` | - | HTTPS 证书路径 |
| `INTERNAL_API_KEY` | `dev-internal-key-change-in-production` | 内部接口密钥 |

## 架构

### 热/冷消息

```
发送 → Redis (热区, TTL=10min)
            ↓ 每30s归档
       PostgreSQL (冷区, 持久化)
```

- 5分钟内消息走 Redis，读写快
- 超时自动归档到 PostgreSQL
- 进程重启不丢失

### Token 体系

```
登录 → 签发:
  short_token (32 hex, 1h 有效)
  long_token  (64 hex, 30d 有效)
验证 → HMAC-SHA256 加盐比对
```

## API 概览

完整接口文档见 [API.md](./API.md)

**User Service (16 端点)**

| 端点 | 权限 | 说明 |
|------|------|------|
| POST /register | 公开 | 注册 (首用户自动 admin) |
| POST /login | 公开 | 登录 → 双 Token |
| GET /verify | Bearer | Token 验证 |
| GET /users/me | Bearer | 当前用户 |
| GET /tokens/me | Bearer | Token 列表 |
| POST /api-keys | Bearer | 创建 API Key |
| GET /internal/user/:id | 内部密钥 | 用户查询 |
| GET/DELETE /admin/users | Admin | 用户管理 |
| PUT /admin/users/:id/permission | Admin | 修改权限 |
| GET/DELETE /admin/tokens | Admin | Token 管理 |
| GET /health, /ready, /metrics | 公开 | 健康检查 |

**Chat Service (19 端点 + 5 WebSocket 事件)**

| 端点 | 权限 | 说明 |
|------|------|------|
| POST /rooms/direct | Bearer | 创建私聊 |
| POST /rooms/group | Bearer | 创建群聊 |
| GET /rooms/:id/messages | Bearer | 消息历史 |
| POST /rooms/:id/messages | Bearer | 发送消息 |
| GET/DELETE /admin/rooms | Admin | 房间管理 |
| POST /admin/rooms/:id/members | Admin | 成员管理 |
| GET /admin/stats | Admin | 统计 |

**WebSocket**: `v1:join`, `v1:leave`, `v1:message`, `v1:online`, `v1:error`

## 性能

| 指标 | 数值 |
|------|------|
| HTTP 并发 | 200 全过 |
| 吞吐量 | 88 rps |
| 响应延迟 | p50=16ms, p99=2.1s |
| 支撑用户 | 1700+ (聊天场景) |

## 部署

见 [DEPLOY.md](./DEPLOY.md)

## 安全

- Helmet 安全头 (CSP, HSTS, X-Frame-Options)
- CORS 可配置
- 请求体限制 (User: 1MB, Chat: 64KB)
- Token HMAC-SHA256 + Salt 存储
- API Key 128 位随机
- 首用户自动 admin + advisory lock 防并发
- Token 碰撞自动重试
- 请求追踪 ID (UUID)
- Graceful Shutdown (SIGINT/SIGTERM)

## 测试

```bash
cd debug
python main.py   # 运行 1253 项集成测试
```
