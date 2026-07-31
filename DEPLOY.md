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
| user-service | `ghcr.io/yingo-server/yingo-user:latest` | 9000 | user-db |
| chat-service | `ghcr.io/yingo-server/yingo-chat:latest` | 9001 | chat-db, chat-cache, user-service |
| user-db | `postgres:16-alpine` | 5432 | - |
| chat-db | `postgres:16-alpine` | 5432 | - |
| chat-cache | `redis:7-alpine` | 6379 | - |

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
  ghcr.io/yingo-server/yingo-user:latest
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
  ghcr.io/yingo-server/yingo-chat:latest
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
  ghcr.io/yingo-server/yingo-user:latest
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
  ghcr.io/yingo-server/yingo-chat:latest
```

### 8. 前端部署

前端为静态文件，放在 Nginx 或 CDN 即可。修改 `config.js` 配置后端地址：

```javascript
window.API_CONFIG = {
  userApi: 'https://<DOMAIN>:9000',
  chatApi: 'https://<DOMAIN>:9001',
};
```

---

## CI/CD 自动构建

两个仓库配置了 GitHub Actions，push 到 main 分支自动构建并推送镜像到 ghcr.io。

### 仓库与镜像对应

| 仓库 | 镜像 |
|------|------|
| `yingo-server/User-Source` | `ghcr.io/yingo-server/yingo-user:latest` |
| `yingo-server/Chat-Source` | `ghcr.io/yingo-server/yingo-chat:latest` |

### 手动触发构建

```bash
# 通过 GitHub API 触发
curl -X POST \
  -H "Authorization: token <GITHUB_PAT>" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/yingo-server/User-Source/actions/workflows/user-build.yml/dispatches \
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

# 拉取最新
docker pull ghcr.io/yingo-server/yingo-user:latest
docker pull ghcr.io/yingo-server/yingo-chat:latest

# 停止旧容器
docker stop user-service chat-service
docker rm user-service chat-service

# 重新启动（使用上面的完整 docker run 命令）
```

### 一键更新脚本

```bash
#!/bin/bash
set -e

docker login ghcr.io -u yingo-server -g <GITHUB_PAT>
docker pull ghcr.io/yingo-server/yingo-user:latest
docker pull ghcr.io/yingo-server/yingo-chat:latest

for svc in user-service chat-service; do
  docker stop $svc 2>/dev/null || true
  docker rm $svc 2>/dev/null || true
done

# 重新启动（复制对应的 docker run 命令）
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

### 查看容器配置

```bash
# 查看环境变量
docker inspect user-service --format '{{range .Config.Env}}{{println .}}{{end}}'
docker inspect chat-service --format '{{range .Config.Env}}{{println .}}{{end}}'

# 查看网络
docker inspect user-service --format '{{.HostConfig.NetworkMode}}'
docker inspect chat-service --format '{{.HostConfig.NetworkMode}}'
```
