# Yingo 部署指南

---

## 目录

1. [架构总览](#架构总览)
2. [前置要求](#前置要求)
3. [服务器部署（server.344977.xyz）](#服务器部署server344977xyz)
4. [通用部署（其他设备）](#通用部署其他设备)
5. [CI/CD 自动构建](#cicd-自动构建)
6. [调试模式](#调试模式)
7. [更新部署](#更新部署)
8. [故障排查](#故障排查)

---

## 架构总览

```
客户端 ──HTTPS──> Nginx/CDN ──> chat-service(:9001) ──HTTPS──> user-service(:9000)
                                         │                           │
                                    PostgreSQL(:5432)          PostgreSQL(:5432)
                                    Redis(:6379)
```

### 服务列表

| 服务 | 镜像 | 端口 | 依赖 |
|------|------|------|------|
| user-service | `ghcr.io/yingo-server/yingo-user:v6.1-stable-law` | 9000 | user-db |
| chat-service | `ghcr.io/yingo-server/yingo-chat:v6.1-stable-law` | 9001 | chat-db, chat-cache, user-service |
| user-db | `postgres:16-alpine` | 5432 | - |
| chat-db | `postgres:16-alpine` | 5432 | - |
| chat-cache | `redis:7-alpine` | 6379 | - |

> 镜像 tag 说明：每次发布构建 `latest` + `vX.Y-*` 版本号 + `commit-sha` 三个标签；生产环境建议固定使用版本号 tag，避免 `latest` 意外漂移。

### Docker 网络

所有服务在 `yingo-net` 网络内通信，服务间通过容器名访问。

---

## 前置要求

- Docker 20.10+
- Docker Compose v2
- SSL 证书（生产环境必需）
- GitHub PAT（拉取 ghcr.io 镜像必需）

---

## 服务器部署（server.344977.xyz）

> 以下为当前生产服务器的完整配置，直接复制执行即可。

### 1. 登录 ghcr.io

```bash
docker login ghcr.io -u yingo-server -g <GITHUB_PAT>
```

### 2. 创建 Docker 网络

```bash
docker network create yingo-net
```

### 2.5 初始化数据库（首次部署 / 重置）

> **重要**：表结构由代码定义，服务启动时不会自动建表。首次部署或需要重置时，必须手动建表。应用连接数据库使用 `colduser`/`coldchat` 用户（非 `yingo`），**建表后必须 GRANT 权限**，否则应用会报 `42501 permission denied`。

```bash
# ═══ 1. 清空 user-db 全部表并重建 ═══
docker exec -i user-db psql -U yingo -d cold_user <<'SQL'
DROP TABLE IF EXISTS oauth_clients, api_keys, tokens, users CASCADE;
CREATE TABLE users (
  id varchar(16) PRIMARY KEY,
  global_name varchar(64) NOT NULL UNIQUE,
  app_names jsonb NOT NULL,
  password_hash text NOT NULL,
  password_salt varchar(32) NOT NULL,
  created_at bigint NOT NULL,
  last_online_at bigint NOT NULL,
  permission varchar(16) NOT NULL DEFAULT 'user',
  online boolean NOT NULL DEFAULT false
);
CREATE TABLE tokens (
  id varchar(16) PRIMARY KEY,
  user_id varchar(16) NOT NULL REFERENCES users(id),
  token_lookup varchar(64) NOT NULL UNIQUE,
  short_lookup varchar(64) NOT NULL UNIQUE,
  short_hash varchar(255) NOT NULL,
  long_hash varchar(255) NOT NULL,
  token_salt varchar(32) NOT NULL,
  short_expires bigint NOT NULL,
  long_expires bigint NOT NULL,
  scopes text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  revoked_at bigint,
  last_used_at bigint
);
CREATE INDEX idx_tokens_user_id ON tokens (user_id);
CREATE INDEX idx_tokens_long_expires ON tokens (long_expires);
CREATE INDEX idx_tokens_short_expires ON tokens (short_expires);
CREATE INDEX idx_tokens_revoked_at ON tokens (revoked_at);
CREATE INDEX idx_tokens_lookup ON tokens (token_lookup);
CREATE TABLE api_keys (
  id varchar(16) PRIMARY KEY,
  user_id varchar(16) NOT NULL REFERENCES users(id),
  key_hash varchar(255) NOT NULL,
  key_salt varchar(32) NOT NULL,
  prefix varchar(4) NOT NULL,
  name varchar(64) NOT NULL,
  scopes text NOT NULL DEFAULT '',
  rate_limit integer NOT NULL DEFAULT 100,
  expires_at bigint NOT NULL,
  created_at bigint NOT NULL,
  last_used_at bigint,
  revoked_at bigint
);
CREATE TABLE oauth_clients (
  id varchar(16) PRIMARY KEY,
  client_id varchar(32) NOT NULL UNIQUE,
  client_secret_hash varchar(255) NOT NULL,
  name varchar(64) NOT NULL,
  app_id varchar(32) NOT NULL,
  allowed_scopes text NOT NULL DEFAULT '',
  created_at bigint NOT NULL,
  status integer NOT NULL DEFAULT 1
);
SQL

# ═══ 2. 清空 chat-db 全部表并重建 ═══
docker exec -i chat-db psql -U yingo -d cold_chat <<'SQL'
DROP TABLE IF EXISTS cold_messages, room_members, rooms CASCADE;
CREATE TABLE rooms (
  id varchar(16) PRIMARY KEY,
  type varchar(8) NOT NULL DEFAULT 'direct',
  name varchar(64),
  creator_id varchar(16) NOT NULL,
  created_at bigint NOT NULL
);
CREATE TABLE room_members (
  id varchar(16) PRIMARY KEY,
  room_id varchar(16) NOT NULL,
  user_id varchar(16) NOT NULL,
  joined_at bigint NOT NULL
);
CREATE UNIQUE INDEX idx_room_members_room_user_unique ON room_members (room_id, user_id);
CREATE TABLE cold_messages (
  id varchar(16) PRIMARY KEY,
  room_id varchar(16) NOT NULL,
  sender_id varchar(16) NOT NULL,
  sender_name varchar(64) NOT NULL,
  sender_app_name varchar(64) NOT NULL,
  content text,
  type varchar(8) NOT NULL DEFAULT 'text',
  sent_at bigint NOT NULL,
  sender_ip varchar(45),
  recalled boolean NOT NULL DEFAULT false,
  manually_deleted boolean NOT NULL DEFAULT false,
  auto_deleted boolean NOT NULL DEFAULT false
);
SQL

# ═══ 3. 授权应用用户（关键！否则 42501 permission denied）═══
docker exec user-db psql -U yingo -d cold_user -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO colduser; GRANT USAGE ON SCHEMA public TO colduser;"
docker exec chat-db psql -U yingo -d cold_chat -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coldchat; GRANT USAGE ON SCHEMA public TO coldchat;"

# ═══ 4. 清空 Redis（热消息/在线状态缓存）═══
docker exec chat-cache redis-cli FLUSHALL

# ═══ 5. 重启服务使连接池/内存缓存失效 ═══
docker restart user-service chat-service

# ═══ 6. 验证 ═══
docker exec user-db psql -U yingo -d cold_user -c "\dt"
docker exec chat-db psql -U yingo -d cold_chat -c "\dt"
curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
```

> 初始管理员：空库时**第一个注册的用户自动成为 admin**（代码内建逻辑），无需手动创建。

### 3. 启动 PostgreSQL 数据库

```bash
# User Service 数据库
docker run -d --name user-db --network yingo-net \
  -p 5433:5432 \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=yingo123 \
  -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Chat Service 数据库
docker run -d --name chat-db --network yingo-net \
  -p 5434:5432 \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=yingo123 \
  -e POSTGRES_DB=cold_chat \
  -v chat_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Redis
docker run -d --name chat-cache --network yingo-net \
  -p 6380:6379 \
  -v chat_redis_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```

### 4. 启动 User Service

```bash
docker run -d --name user-service --network yingo-net \
  -p 9000:9000 \
  -e CORS_ORIGINS="https://chats.344977.xyz,https://server.344977.xyz" \
  -e SSL_CERT=/etc/ssl/yingo/cert.pem \
  -e SSL_KEY=/etc/ssl/yingo/key.pem \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://colduser:yingo123@user-db:5432/cold_user" \
  -e PEPPER_SECRET="dev-pepper-change-in-production" \
  -e TOKEN_SECRET="dev-token-secret-change-in-production" \
  -e INTERNAL_API_KEY="dev-internal-key-change-in-production" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -v /etc/ssl/yingo:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-user:v6.1-stable-law
```

### 5. 启动 Chat Service

```bash
docker run -d --name chat-service --network yingo-net \
  -p 9001:9001 \
  -e CORS_ORIGINS="https://chats.344977.xyz,https://server.344977.xyz" \
  -e SSL_CERT=/etc/ssl/yingo/cert.pem \
  -e SSL_KEY=/etc/ssl/yingo/key.pem \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://coldchat:yingo123@chat-db:5432/cold_chat" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -e USER_SERVICE_URL="https://user-service:9000" \
  -e INTERNAL_API_KEY="dev-internal-key-change-in-production" \
  -e PEPPER_SECRET="dev-pepper-change-in-production" \
  -e TOKEN_SECRET="dev-token-secret-change-in-production" \
  -v /etc/ssl/yingo:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-chat:v6.1-stable-law
```

### 6. 验证

```bash
# 检查容器状态
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 健康检查
curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
```

---

## 通用部署（其他设备）

> 适用于任何 Linux 服务器，使用自己的域名和证书。

### 1. 环境变量模板

在部署前，替换以下占位符：

| 占位符 | 说明 | 示例 |
|--------|------|------|
| `<DOMAIN>` | 你的域名 | `example.com` |
| `<SSL_CERT_PATH>` | SSL 证书路径 | `/etc/ssl/certs/cert.pem` |
| `<SSL_KEY_PATH>` | SSL 私钥路径 | `/etc/ssl/private/key.pem` |
| `<CORS_ORIGINS>` | CORS 允许的域名 | `https://chat.example.com,https://example.com` |
| `<DB_PASSWORD>` | 数据库密码 | 用 `openssl rand -hex 16` 生成 |
| `<PEPPER_SECRET>` | 密码哈希 Pepper | 用 `openssl rand -hex 32` 生成 |
| `<TOKEN_SECRET>` | Token 哈希 Secret | 用 `openssl rand -hex 32` 生成 |
| `<INTERNAL_API_KEY>` | 内部 API 密钥 | 用 `openssl rand -hex 32` 生成 |

### 2. 生成强密钥

```bash
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "PEPPER_SECRET=$(openssl rand -hex 32)"
echo "TOKEN_SECRET=$(openssl rand -hex 32)"
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
```

### 3. 登录 ghcr.io

```bash
docker login ghcr.io -u <GITHUB_USERNAME> -g <GITHUB_PAT>
```

### 4. 创建网络和存储

```bash
docker network create yingo-net
```

### 5. 启动数据库

```bash
# User Service 数据库
docker run -d --name user-db --network yingo-net \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=<DB_PASSWORD> \
  -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Chat Service 数据库
docker run -d --name chat-db --network yingo-net \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=<DB_PASSWORD> \
  -e POSTGRES_DB=cold_chat \
  -v chat_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Redis
docker run -d --name chat-cache --network yingo-net \
  -v chat_redis_data:/data \
  --restart unless-stopped \
  redis:7-alpine redis-server --appendonly yes
```

### 6. 启动 User Service

```bash
docker run -d --name user-service --network yingo-net \
  -p 9000:9000 \
  -e CORS_ORIGINS="<CORS_ORIGINS>" \
  -e SSL_CERT=<SSL_CERT_PATH> \
  -e SSL_KEY=<SSL_KEY_PATH> \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://yingo:<DB_PASSWORD>@user-db:5432/cold_user" \
  -e PEPPER_SECRET="<PEPPER_SECRET>" \
  -e TOKEN_SECRET="<TOKEN_SECRET>" \
  -e INTERNAL_API_KEY="<INTERNAL_API_KEY>" \
  -v <SSL_CERT_DIR>:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-user:v6.1-stable-law
```

### 7. 启动 Chat Service

```bash
docker run -d --name chat-service --network yingo-net \
  -p 9001:9001 \
  -e CORS_ORIGINS="<CORS_ORIGINS>" \
  -e SSL_CERT=<SSL_CERT_PATH> \
  -e SSL_KEY=<SSL_KEY_PATH> \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://yingo:<DB_PASSWORD>@chat-db:5432/cold_chat" \
  -e REDIS_URL="redis://chat-cache:6379" \
  -e USER_SERVICE_URL="https://user-service:9000" \
  -e INTERNAL_API_KEY="<INTERNAL_API_KEY>" \
  -e PEPPER_SECRET="<PEPPER_SECRET>" \
  -e TOKEN_SECRET="<TOKEN_SECRET>" \
  -v <SSL_CERT_DIR>:/etc/ssl/yingo:ro \
  --restart unless-stopped \
  ghcr.io/yingo-server/yingo-chat:v6.1-stable-law
```

### 8. 前端部署

> 前端仓库 `yingo-server/chats-apps`（纯用户页面），静态构建后在 Netlify 手动部署。

前端为静态文件，放在 Nginx 或 CDN 即可。构建：

```bash
cd frontend
npm install
npm run build
# 产物在 dist/，Netlify 直接拖入部署；_redirects 已内置 SPA 回退
```

---

## CI/CD 自动构建

`yingo-server/chats` 仓库配置了 GitHub Actions，push 到 main 分支（`user/**`、`chat/**`、workflow 文件变更）自动构建并推送镜像到 ghcr.io。每次构建打三个标签：`latest` + `vX.Y-*` 版本号 + commit-sha。

### 仓库与镜像对应

| 仓库 | 镜像 |
|------|------|
| `yingo-server/chats` (`user/` 目录) | `ghcr.io/yingo-server/yingo-user` |
| `yingo-server/chats` (`chat/` 目录) | `ghcr.io/yingo-server/yingo-chat` |

### 发布新版本

```bash
# 1. 打版本标签（触发两个 workflow 重新构建 + 推送对应版本 tag 镜像）
git tag vX.Y-stable-xxx
git push origin vX.Y-stable-xxx

# 2. 修改两个 workflow 中 type=raw,value=<版本号> 后推送 main
git add .github/workflows/user-build.yml .github/workflows/chat-build.yml
git commit -m "ci: tag vX.Y-stable-xxx on user and chat images"
git push origin main
```

### 手动触发构建

```bash
# 通过 GitHub API 触发
curl -X POST \
  -H "Authorization: token <GITHUB_PAT>" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/yingo-server/chats/actions/workflows/user-build.yml/dispatches \
  -d '{"ref":"main"}'
```

---

## 调试模式

调试模式通过 HTTP Header 临时提升请求权限为 admin，用于测试。

### 使用方法

在所有 HTTP 请求中添加 Header：

```
x-debug-admin: bf3f1655d8144e2f850dd78f2b27da46
```

### 启用条件

- 设置 `DEBUG_SECRET` 环境变量（值与 header 中的密钥一致）
- 或者 `NODE_ENV !== "production"`（开发环境默认启用）

### 示例

```bash
# 用调试头访问 admin 接口
curl -k -H "Authorization: Bearer <TOKEN>" \
     -H "x-debug-admin: bf3f1655d8144e2f850dd78f2b27da46" \
     https://server.344977.xyz:9000/api/v1/admin/users
```

### 安全说明

- 调试头仅在当次请求生效，不带则权限回落
- 密钥为 128 位随机值，不可猜测
- 生产环境需显式设置 `DEBUG_SECRET` 才能启用
- 建议测试完成后移除 `DEBUG_SECRET` 环境变量

---

## 更新部署

### 拉取最新镜像并重启

```bash
# 登录 ghcr.io
docker login ghcr.io -u yingo-server -g <GITHUB_PAT>

# 拉取指定版本（替换 <TAG> 为 vX.Y-* 或 commit-sha）
docker pull ghcr.io/yingo-server/yingo-user:<TAG>
docker pull ghcr.io/yingo-server/yingo-chat:<TAG>

# 停止旧容器
docker stop user-service chat-service
docker rm user-service chat-service

# 重新启动（使用上面的完整 docker run 命令，镜像 tag 用 <TAG>）
```

### 一键更新脚本

```bash
#!/bin/bash
set -e

TAG=${1:-v6.1-stable-law}

docker login ghcr.io -u yingo-server -g <GITHUB_PAT>
docker pull ghcr.io/yingo-server/yingo-user:$TAG
docker pull ghcr.io/yingo-server/yingo-chat:$TAG

for svc in user-service chat-service; do
  docker stop $svc 2>/dev/null || true
  docker rm $svc 2>/dev/null || true
done

# 重新启动（复制对应的 docker run 命令，镜像 tag 用 $TAG）
```

---

## 故障排查

### 容器无法启动

```bash
# 查看日志
docker logs user-service --tail 50
docker logs chat-service --tail 50

# 检查数据库连接
docker exec user-db pg_isready -U yingo -d cold_user
docker exec chat-db pg_isready -U yingo -d cold_chat

# 检查 Redis
docker exec chat-cache redis-cli ping
```

### 常见错误

| 错误 | 原因 | 解决 |
|------|------|------|
| `ECONNREFUSED` | 数据库/Redis 未启动 | 检查容器状态 |
| `admin access required` | 缺少调试头或无 admin 权限 | 添加 `x-debug-admin` header |
| `unauthorized` | Token 无效或过期 | 重新登录获取 Token |
| `SSL handshake error` | 证书路径错误或未挂载 | 检查 `-v` 挂载和 `SSL_CERT`/`SSL_KEY` |
| `42501 permission denied for table ...` | DROP+CREATE 后未给应用用户 GRANT | 执行初始化第 3 步的 GRANT 命令 |

### 查看容器配置

```bash
# 查看环境变量
docker inspect user-service --format '{{range .Config.Env}}{{println .}}{{end}}'
docker inspect chat-service --format '{{range .Config.Env}}{{println .}}{{end}}'

# 查看网络
docker inspect user-service --format '{{.HostConfig.NetworkMode}}'
docker inspect chat-service --format '{{.HostConfig.NetworkMode}}'
```
