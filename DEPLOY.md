# Yingo 閮ㄧ讲鎸囧崡

---

## 鐩綍

1. [鏋舵瀯鎬昏](#鏋舵瀯鎬昏)
2. [鍓嶇疆瑕佹眰](#鍓嶇疆瑕佹眰)
3. [鏈嶅姟鍣ㄩ儴缃诧紙server.344977.xyz锛塢(#鏈嶅姟鍣ㄩ儴缃瞫erver344977xyz)
4. [閫氱敤閮ㄧ讲锛堝叾浠栬澶囷級](#閫氱敤閮ㄧ讲鍏朵粬璁惧)
5. [CI/CD 鑷姩鏋勫缓](#cicd-鑷姩鏋勫缓)
6. [璋冭瘯妯″紡](#璋冭瘯妯″紡)
7. [鏇存柊閮ㄧ讲](#鏇存柊閮ㄧ讲)
8. [鏁呴殰鎺掓煡](#鏁呴殰鎺掓煡)

---

## 鏋舵瀯鎬昏

```
瀹㈡埛绔?鈹€鈹€HTTPS鈹€鈹€> Nginx/CDN 鈹€鈹€> chat-service(:9001) 鈹€鈹€HTTPS鈹€鈹€> user-service(:9000)
                                         鈹?                          鈹?                                    PostgreSQL(:5432)          PostgreSQL(:5432)
                                    Redis(:6379)
```

### 鏈嶅姟鍒楄〃

| 鏈嶅姟 | 闀滃儚 | 绔彛 | 渚濊禆 |
|------|------|------|------|
| user-service | `ghcr.io/yingo-server/yingo-user:v6.1-stable-law` | 9000 | user-db |
| chat-service | `ghcr.io/yingo-server/yingo-chat:v6.1-stable-law` | 9001 | chat-db, chat-cache, user-service |
| user-db | `postgres:16-alpine` | 5432 | - |
| chat-db | `postgres:16-alpine` | 5432 | - |
| chat-cache | `redis:7-alpine` | 6379 | - |

> 闀滃儚 tag 璇存槑锛氭瘡娆″彂甯冩瀯寤?`latest` + `vX.Y-*` 鐗堟湰鍙?+ `commit-sha` 涓変釜鏍囩锛涚敓浜х幆澧冨缓璁浐瀹氫娇鐢ㄧ増鏈彿 tag锛岄伩鍏?`latest` 鎰忓婕傜Щ銆?
### Docker 缃戠粶

鎵€鏈夋湇鍔″湪 `yingo-net` 缃戠粶鍐呴€氫俊锛屾湇鍔￠棿閫氳繃瀹瑰櫒鍚嶈闂€?
---

## 鍓嶇疆瑕佹眰

- Docker 20.10+
- Docker Compose v2
- SSL 璇佷功锛堢敓浜х幆澧冨繀闇€锛?- GitHub PAT锛堟媺鍙?ghcr.io 闀滃儚蹇呴渶锛?
---

## 鏈嶅姟鍣ㄩ儴缃诧紙server.344977.xyz锛?
> 浠ヤ笅涓哄綋鍓嶇敓浜ф湇鍔″櫒鐨勫畬鏁撮厤缃紝鐩存帴澶嶅埗鎵ц鍗冲彲銆?
### 1. 鐧诲綍 ghcr.io

```bash
docker login ghcr.io -u yingo-server -g <GITHUB_PAT>
```

### 2. 鍒涘缓 Docker 缃戠粶

```bash
docker network create yingo-net
```

### 2.5 鍒濆鍖栨暟鎹簱锛堥娆￠儴缃?/ 閲嶇疆锛?
> **閲嶈**锛氳〃缁撴瀯鐢变唬鐮佸畾涔夛紝鏈嶅姟鍚姩鏃朵笉浼氳嚜鍔ㄥ缓琛ㄣ€傞娆￠儴缃叉垨闇€瑕侀噸缃椂锛屽繀椤绘墜鍔ㄥ缓琛ㄣ€傚簲鐢ㄨ繛鎺ユ暟鎹簱浣跨敤 `colduser`/`coldchat` 鐢ㄦ埛锛堥潪 `yingo`锛夛紝**寤鸿〃鍚庡繀椤?GRANT 鏉冮檺**锛屽惁鍒欏簲鐢ㄤ細鎶?`42501 permission denied`銆?
```bash
# 鈺愨晲鈺?1. 娓呯┖ user-db 鍏ㄩ儴琛ㄥ苟閲嶅缓 鈺愨晲鈺?docker exec -i user-db psql -U yingo -d cold_user <<'SQL'
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

# 鈺愨晲鈺?2. 娓呯┖ chat-db 鍏ㄩ儴琛ㄥ苟閲嶅缓 鈺愨晲鈺?docker exec -i chat-db psql -U yingo -d cold_chat <<'SQL'
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

# 鈺愨晲鈺?3. 鎺堟潈搴旂敤鐢ㄦ埛锛堝叧閿紒鍚﹀垯 42501 permission denied锛夆晲鈺愨晲
docker exec user-db psql -U yingo -d cold_user -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO colduser; GRANT USAGE ON SCHEMA public TO colduser;"
docker exec chat-db psql -U yingo -d cold_chat -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO coldchat; GRANT USAGE ON SCHEMA public TO coldchat;"

# 鈺愨晲鈺?4. 娓呯┖ Redis锛堢儹娑堟伅/鍦ㄧ嚎鐘舵€佺紦瀛橈級鈺愨晲鈺?docker exec chat-cache redis-cli FLUSHALL

# 鈺愨晲鈺?5. 閲嶅惎鏈嶅姟浣胯繛鎺ユ睜/鍐呭瓨缂撳瓨澶辨晥 鈺愨晲鈺?docker restart user-service chat-service

# 鈺愨晲鈺?6. 楠岃瘉 鈺愨晲鈺?docker exec user-db psql -U yingo -d cold_user -c "\dt"
docker exec chat-db psql -U yingo -d cold_chat -c "\dt"
curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
```

> 鍒濆绠＄悊鍛橈細绌哄簱鏃?*绗竴涓敞鍐岀殑鐢ㄦ埛鑷姩鎴愪负 admin**锛堜唬鐮佸唴寤洪€昏緫锛夛紝鏃犻渶鎵嬪姩鍒涘缓銆?
### 3. 鍚姩 PostgreSQL 鏁版嵁搴?
```bash
# User Service 鏁版嵁搴?docker run -d --name user-db --network yingo-net \
  -p 5433:5432 \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=yingo123 \
  -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Chat Service 鏁版嵁搴?docker run -d --name chat-db --network yingo-net \
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

### 4. 鍚姩 User Service

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

### 5. 鍚姩 Chat Service

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

### 6. 楠岃瘉

```bash
# 妫€鏌ュ鍣ㄧ姸鎬?docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# 鍋ュ悍妫€鏌?curl -k https://server.344977.xyz:9000/api/v1/health
curl -k https://server.344977.xyz:9001/api/v1/health
```

---

## 閫氱敤閮ㄧ讲锛堝叾浠栬澶囷級

> 閫傜敤浜庝换浣?Linux 鏈嶅姟鍣紝浣跨敤鑷繁鐨勫煙鍚嶅拰璇佷功銆?
### 1. 鐜鍙橀噺妯℃澘

鍦ㄩ儴缃插墠锛屾浛鎹互涓嬪崰浣嶇锛?
| 鍗犱綅绗?| 璇存槑 | 绀轰緥 |
|--------|------|------|
| `<DOMAIN>` | 浣犵殑鍩熷悕 | `example.com` |
| `<SSL_CERT_PATH>` | SSL 璇佷功璺緞 | `/etc/ssl/certs/cert.pem` |
| `<SSL_KEY_PATH>` | SSL 绉侀挜璺緞 | `/etc/ssl/private/key.pem` |
| `<CORS_ORIGINS>` | CORS 鍏佽鐨勫煙鍚?| `https://chat.example.com,https://example.com` |
| `<DB_PASSWORD>` | 鏁版嵁搴撳瘑鐮?| 鐢?`openssl rand -hex 16` 鐢熸垚 |
| `<PEPPER_SECRET>` | 瀵嗙爜鍝堝笇 Pepper | 鐢?`openssl rand -hex 32` 鐢熸垚 |
| `<TOKEN_SECRET>` | Token 鍝堝笇 Secret | 鐢?`openssl rand -hex 32` 鐢熸垚 |
| `<INTERNAL_API_KEY>` | 鍐呴儴 API 瀵嗛挜 | 鐢?`openssl rand -hex 32` 鐢熸垚 |

### 2. 鐢熸垚寮哄瘑閽?
```bash
echo "DB_PASSWORD=$(openssl rand -hex 16)"
echo "PEPPER_SECRET=$(openssl rand -hex 32)"
echo "TOKEN_SECRET=$(openssl rand -hex 32)"
echo "INTERNAL_API_KEY=$(openssl rand -hex 32)"
```

### 3. 鐧诲綍 ghcr.io

```bash
docker login ghcr.io -u <GITHUB_USERNAME> -g <GITHUB_PAT>
```

### 4. 鍒涘缓缃戠粶鍜屽瓨鍌?
```bash
docker network create yingo-net
```

### 5. 鍚姩鏁版嵁搴?
```bash
# User Service 鏁版嵁搴?docker run -d --name user-db --network yingo-net \
  -e POSTGRES_USER=yingo \
  -e POSTGRES_PASSWORD=<DB_PASSWORD> \
  -e POSTGRES_DB=cold_user \
  -v user_pg_data:/var/lib/postgresql/data \
  --restart unless-stopped \
  postgres:16-alpine

# Chat Service 鏁版嵁搴?docker run -d --name chat-db --network yingo-net \
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

### 6. 鍚姩 User Service

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

### 7. 鍚姩 Chat Service

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

### 8. 鍓嶇閮ㄧ讲

> 鍓嶇浠撳簱 `yingo-server/chats-apps`锛堢函鐢ㄦ埛椤甸潰锛夛紝闈欐€佹瀯寤哄悗鍦?Netlify 鎵嬪姩閮ㄧ讲銆?
鍓嶇涓洪潤鎬佹枃浠讹紝鏀惧湪 Nginx 鎴?CDN 鍗冲彲銆傛瀯寤猴細

```bash
cd frontend
npm install
npm run build
# 浜х墿鍦?dist/锛孨etlify 鐩存帴鎷栧叆閮ㄧ讲锛沖redirects 宸插唴缃?SPA 鍥為€€
```

---

## CI/CD 鑷姩鏋勫缓

`yingo-server/chats` 浠撳簱閰嶇疆浜?GitHub Actions锛宲ush 鍒?main 鍒嗘敮锛坄user/**`銆乣chat/**`銆亀orkflow 鏂囦欢鍙樻洿锛夎嚜鍔ㄦ瀯寤哄苟鎺ㄩ€侀暅鍍忓埌 ghcr.io銆傛瘡娆℃瀯寤烘墦涓変釜鏍囩锛歚latest` + `vX.Y-*` 鐗堟湰鍙?+ commit-sha銆?
### 浠撳簱涓庨暅鍍忓搴?
| 浠撳簱 | 闀滃儚 |
|------|------|
| `yingo-server/chats` (`user/` 鐩綍) | `ghcr.io/yingo-server/yingo-user` |
| `yingo-server/chats` (`chat/` 鐩綍) | `ghcr.io/yingo-server/yingo-chat` |

### 鍙戝竷鏂扮増鏈?
```bash
# 1. 鎵撶増鏈爣绛撅紙瑙﹀彂涓や釜 workflow 閲嶆柊鏋勫缓 + 鎺ㄩ€佸搴旂増鏈?tag 闀滃儚锛?git tag vX.Y-stable-xxx
git push origin vX.Y-stable-xxx

# 2. 淇敼涓や釜 workflow 涓?type=raw,value=<鐗堟湰鍙? 鍚庢帹閫?main
git add .github/workflows/user-build.yml .github/workflows/chat-build.yml
git commit -m "ci: tag vX.Y-stable-xxx on user and chat images"
git push origin main
```

### 鎵嬪姩瑙﹀彂鏋勫缓

```bash
# 閫氳繃 GitHub API 瑙﹀彂
curl -X POST \
  -H "Authorization: token <GITHUB_PAT>" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/repos/yingo-server/chats/actions/workflows/user-build.yml/dispatches \
  -d '{"ref":"main"}'
```

---

## 璋冭瘯妯″紡

璋冭瘯妯″紡閫氳繃 HTTP Header 涓存椂鎻愬崌璇锋眰鏉冮檺涓?admin锛岀敤浜庢祴璇曘€?
### 浣跨敤鏂规硶

鍦ㄦ墍鏈?HTTP 璇锋眰涓坊鍔?Header锛?
```
x-debug-admin: bf3f1655d8144e2f850dd78f2b27da46
```

### 鍚敤鏉′欢

- 璁剧疆 `DEBUG_SECRET` 鐜鍙橀噺锛堝€间笌 header 涓殑瀵嗛挜涓€鑷达級
- 鎴栬€?`NODE_ENV !== "production"`锛堝紑鍙戠幆澧冮粯璁ゅ惎鐢級

### 绀轰緥

```bash
# 鐢ㄨ皟璇曞ご璁块棶 admin 鎺ュ彛
curl -k -H "Authorization: Bearer <TOKEN>" \
     -H "x-debug-admin: bf3f1655d8144e2f850dd78f2b27da46" \
     https://server.344977.xyz:9000/api/v1/admin/users
```

### 瀹夊叏璇存槑

- 璋冭瘯澶翠粎鍦ㄥ綋娆¤姹傜敓鏁堬紝涓嶅甫鍒欐潈闄愬洖钀?- 瀵嗛挜涓?128 浣嶉殢鏈哄€硷紝涓嶅彲鐚滄祴
- 鐢熶骇鐜闇€鏄惧紡璁剧疆 `DEBUG_SECRET` 鎵嶈兘鍚敤
- 寤鸿娴嬭瘯瀹屾垚鍚庣Щ闄?`DEBUG_SECRET` 鐜鍙橀噺

---

## 鏇存柊閮ㄧ讲

### 鎷夊彇鏈€鏂伴暅鍍忓苟閲嶅惎

```bash
# 鐧诲綍 ghcr.io
docker login ghcr.io -u yingo-server -g <GITHUB_PAT>

# 鎷夊彇鎸囧畾鐗堟湰锛堟浛鎹?<TAG> 涓?vX.Y-* 鎴?commit-sha锛?docker pull ghcr.io/yingo-server/yingo-user:<TAG>
docker pull ghcr.io/yingo-server/yingo-chat:<TAG>

# 鍋滄鏃у鍣?docker stop user-service chat-service
docker rm user-service chat-service

# 閲嶆柊鍚姩锛堜娇鐢ㄤ笂闈㈢殑瀹屾暣 docker run 鍛戒护锛岄暅鍍?tag 鐢?<TAG>锛?```

### 涓€閿洿鏂拌剼鏈?
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

# 閲嶆柊鍚姩锛堝鍒跺搴旂殑 docker run 鍛戒护锛岄暅鍍?tag 鐢?$TAG锛?```

---

## 鏁呴殰鎺掓煡

### 瀹瑰櫒鏃犳硶鍚姩

```bash
# 鏌ョ湅鏃ュ織
docker logs user-service --tail 50
docker logs chat-service --tail 50

# 妫€鏌ユ暟鎹簱杩炴帴
docker exec user-db pg_isready -U yingo -d cold_user
docker exec chat-db pg_isready -U yingo -d cold_chat

# 妫€鏌?Redis
docker exec chat-cache redis-cli ping
```

### 甯歌閿欒

| 閿欒 | 鍘熷洜 | 瑙ｅ喅 |
|------|------|------|
| `ECONNREFUSED` | 鏁版嵁搴?Redis 鏈惎鍔?| 妫€鏌ュ鍣ㄧ姸鎬?|
| `admin access required` | 缂哄皯璋冭瘯澶存垨鏃?admin 鏉冮檺 | 娣诲姞 `x-debug-admin` header |
| `unauthorized` | Token 鏃犳晥鎴栬繃鏈?| 閲嶆柊鐧诲綍鑾峰彇 Token |
| `SSL handshake error` | 璇佷功璺緞閿欒鎴栨湭鎸傝浇 | 妫€鏌?`-v` 鎸傝浇鍜?`SSL_CERT`/`SSL_KEY` |
| `42501 permission denied for table ...` | DROP+CREATE 鍚庢湭缁欏簲鐢ㄧ敤鎴?GRANT | 鎵ц鍒濆鍖栫 3 姝ョ殑 GRANT 鍛戒护 |

### 鏌ョ湅瀹瑰櫒閰嶇疆

```bash
# 鏌ョ湅鐜鍙橀噺
docker inspect user-service --format '{{range .Config.Env}}{{println .}}{{end}}'
docker inspect chat-service --format '{{range .Config.Env}}{{println .}}{{end}}'

# 鏌ョ湅缃戠粶
docker inspect user-service --format '{{.HostConfig.NetworkMode}}'
docker inspect chat-service --format '{{.HostConfig.NetworkMode}}'
```

---

## 鍓嶇閮ㄧ讲

鍓嶇浠撳簱 `yingo-server/chats-apps`锛堢函鐢ㄦ埛椤甸潰锛夛紝闈欐€佹瀯寤哄悗 Netlify 鎵嬪姩閮ㄧ讲銆?
### 鏋勫缓

```bash
cd frontend
npm install
npm run build
# 浜х墿 dist/锛孨etlify 鐩存帴鎷栧叆閮ㄧ讲锛沖redirects 宸插唴缃?SPA 鍥為€€
```

### 鍓嶇鎶€鏈爤

- React 19 + TypeScript + Vite
- Zustand锛堢姸鎬佺鐞嗭級+ persist 涓棿浠?- Tailwind CSS 4 + shadcn/ui 缁勪欢
- Socket.IO Client锛堝疄鏃堕€氫俊锛?- React Router v7锛堣矾鐢憋級
- Radix UI 鍘熻锛圖ialog/Dropdown/Tooltip 绛夛級

### 鍓嶇 Bug 鍒楄〃锛?50 涓級

浠ヤ笅涓哄墠绔唬鐮佸鏌ュ彂鐜扮殑 150 涓姛鑳?bug锛屾寜绫诲埆鍒嗙被銆?
#### 涓€銆丄PI/缃戠粶灞傦紙12 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 1 | `api/client.ts` | baseUrl 榛樿 ""锛屽紑鍙戠幆澧冧笉璧?/chat-api proxy |
| 2 | `vite.config.ts` | proxy /api 閲嶅啓鍘绘帀 /user 鍓嶇紑锛屼絾鍓嶇璺緞宸叉槸 /api/v1/... |
| 3 | `vite.config.ts` | /chat-api proxy 鎸囧悜 localhost:9001锛屼絾 client.ts baseUrl 鏄?"" 涓嶄細瑙﹀彂 proxy |
| 4 | `api/client.ts` | 401 澶勭悊娓呴櫎 localStorage 鍚?redirect 鍒?/login锛屾湭淇濈暀褰撳墠椤甸潰 URL |
| 5 | `api/client.ts` | 10 绉掕秴鏃跺お鐭紝澶ф枃浠朵笂浼犲彲鑳藉け璐?|
| 6 | `api/client.ts` | 闈?JSON 鍝嶅簲杩斿洖 {} as T锛岀被鍨嬩笉瀹夊叏 |
| 7 | `api/client.ts` | 閿欒澶勭悊锛氱綉缁滈敊璇拰 HTTP 閿欒閮?throw Error锛屾棤娉曞尯鍒?|
| 8 | `api/chat.ts` | 姣忎釜 API 鍑芥暟閮藉垱寤烘柊鐨?URLSearchParams |
| 9 | `types/api.ts` | LoginOkRes 鐨?expires_in 瀛楁鍓嶇鏈娇鐢?|
| 10 | `types/api.ts` | AdminSendMessageReq 鐨?type 鏄彲閫夌殑锛屼絾鍚庣鍙兘瑕佹眰 |
| 11 | `api/client.ts` | error 瀛楁 data?.error 鍙兘涓嶅瓨鍦ㄤ簬鍝嶅簲浣撲腑 |
| 12 | `api/client.ts` | 鏃犺姹傞噸璇曢€昏緫鐢ㄤ簬鐬€佹晠闅?|

#### 浜屻€佽璇?鎺堟潈锛?3 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 13 | `AuthGuard.tsx` | 鍙鏌?isAuthenticated锛屼笉妫€鏌?token 鏄惁杩囨湡 |
| 14 | `useAuthStore.ts` | fetchMe() 澶辫触娓呴櫎鎵€鏈?auth state锛屼絾 401 宸茬敱 client.ts 澶勭悊 |
| 15 | `useAuthStore.ts` | login() 鍚庣珛鍗?fetchMe()锛宼oken 鍙兘杩樻病鐢熸晥锛堢珵浜夋潯浠讹級 |
| 16 | `useAuthStore.ts` | register() 鍚庤嚜鍔?login()锛屼絾 register 杩斿洖鐨勭敤鎴峰彲鑳戒笉鏄?admin |
| 17 | `ProfilePage.tsx` | isOwn = id === user?.id \|\| !id锛宨d 涓?undefined 鏃舵樉绀鸿嚜宸辩殑璧勬枡 |
| 18 | `ProfilePage.tsx` | adminGetUser 澶辫触锛?03/404锛塩atch 鍚炴帀浜嗛敊璇?|
| 19 | `Header.tsx` | permission 鍙兘涓?null锛堢敤鎴锋湭鐧诲綍浣嗙姸鎬佹寔涔呭寲锛夛紝admin badge 涓嶆樉绀?|
| 20 | `api/client.ts` | token 瀛樺湪 localStorage锛屽彲琚?XSS 绐冨彇 |
| 21 | `api/client.ts` | 401 娓呴櫎 localStorage 浣嗘湭閫氱煡鍏朵粬鏍囩椤?|
| 22 | `AuthGuard.tsx` | isAuthenticated 鏉ヨ嚜 localStorage锛屽彲琚吉閫?|
| 23 | `RegisterForm.tsx` | 瀵嗙爜鍓嶇楠岃瘉锛? 浣嶄互涓婏級锛屼絾鍚庣鍙兘瑕佹眰鏇翠弗鏍?|
| 24 | `vite.config.ts` | proxy 閰嶇疆鍙湪寮€鍙戠幆澧冿紝鐢熶骇鐜闇€瑕佹纭厤缃?CORS |
| 25 | `api/chat.ts` | admin API 璋冪敤涓嶅甫 CSRF 淇濇姢 |

#### 涓夈€佹秷鎭?鑱婂ぉ锛?5 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 26 | `MessageList.tsx` | messages.slice().reverse() 鍚庢覆鏌擄紝key 鐢?msg.id 浣?reverse() 涓嶆敼鍙樺師鏁扮粍 |
| 27 | `MessageList.tsx` | useEffect 渚濊禆 [currentRoomId, fetchMessages]锛宖etchMessages 寮曠敤鍙樺寲瀵艰嚧閲嶅 fetch |
| 28 | `MessageList.tsx` | fetchMessages 鏃跺厛 reset() 鍐?fetch锛屼絾 fetchMessages 鍐呴儴涔熸湁 reset 鍙傛暟 |
| 29 | `MessageList.tsx` | prevMsgCountRef 妫€娴嬫柊娑堟伅浣?reverse 娓叉煋瀵艰嚧 scrollIntoView 涓嶅噯纭?|
| 30 | `MessageItem.tsx` | senderName.slice(0, 2).toUpperCase()锛宻enderName 涓虹┖瀛楃涓蹭細鍑洪敊 |
| 31 | `MessageItem.tsx` | isOwn 鐢?message.senderId === user?.id锛寀ser 涓?null 浼?crash |
| 32 | `MessageInput.tsx` | handleSend 鍚?setText("")锛屽彂閫佸け璐?setText(content)锛屽厜鏍囦綅缃笉瀵?|
| 33 | `MessageInput.tsx` | textareaRef.current.style.height 璁剧疆锛屼絾 React 鍙楁帶缁勪欢鍙兘鍐茬獊 |
| 34 | `MessageInput.tsx` | Enter 鍙戦€侊紝Shift+Enter 鎹㈣锛屼絾绉诲姩绔彲鑳芥病鏈?Shift 閿?|
| 35 | `useSocket.ts` | sendMessage 瓒呮椂 10 绉掞紝缃戠粶寤惰繜鍙兘鏇撮暱 |
| 36 | `useSocket.ts` | socket.emit 甯?ack 鍥炶皟锛屼絾 ack 鍙兘鍦?disconnect 鍚庤璋冪敤 |
| 37 | `useSocket.ts` | joinedRoomsRef 鍦?connect 鏃堕噸鍙?join锛屽彲鑳介噸澶嶅姞鍏?|
| 38 | `useSocket.ts` | chatApiUrl 榛樿 ${window.location.origin}/chat-api锛岀敓浜х幆澧冨彲鑳戒笉瀛樺湪 |
| 39 | `MessageItem.tsx` | message.content 鐩存帴娓叉煋锛屽彲鑳藉寘鍚?XSS锛堝悗绔凡杞箟浣嗘湭楠岃瘉锛?|
| 40 | `useSocket.ts` | longToken 瀛樺湪鍐呭瓨涓絾椤甸潰鍒锋柊鍚庝粠 localStorage 鎭㈠ |

#### 鍥涖€佹埧闂?缇ょ粍锛?2 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 41 | `CreateRoom.tsx` | groupMembers 鐢ㄩ€楀彿鍒嗛殧锛屼絾鐢ㄦ埛鍙兘鐢ㄧ┖鏍?鍒嗗彿绛?|
| 42 | `CreateRoom.tsx` | createGroup 浼?memberIds.length > 0 ? memberIds : undefined锛岀┖鏁扮粍浼?undefined |
| 43 | `RoomItem.tsx` | DM 绫诲瀷鏄剧ず "DM " + 鐢ㄦ埛 ID锛?6 浣嶆暟瀛椾笉鍙锛?|
| 44 | `RoomItem.tsx` | otherUserId 鐢?room.memberIds.find锛屼絾 memberIds 瀛楁鍦?Room 绫诲瀷涓湭瀹氫箟 |
| 45 | `types/models.ts` | Room memberIds 瀛楁瀹氫箟浣?API 杩斿洖鍙兘娌℃湁 |
| 46 | `RoomItem.tsx` | isOnline 璁＄畻 otherUserId 涓?null 鏃舵樉绀?Offline |
| 47 | `Sidebar.tsx` | direct 绫诲瀷 memberIds 鎷兼帴浣?memberIds 鍙兘涓嶅寘鍚嚜宸?|
| 48 | `Sidebar.tsx` | handleSelect 璁剧疆 currentRoomId 骞?navigate锛屽彲鑳借Е鍙?ChatPage 閲嶅 joinRoom |
| 49 | `Sidebar.tsx` | mobile 渚ц竟鏍忕偣鍑婚伄缃╁叧闂絾鐐瑰嚮鍐呴儴涓嶄細鍏抽棴 |
| 50 | `ChatPage.tsx` | headerTitle DM 绫诲瀷鏄剧ず "DM with " + 鐢ㄦ埛 ID锛堜笉鍙锛?|
| 51 | `ChatPage.tsx` | reconnecting 鐘舵€?5 绉掑悗鑷姩娑堝け浣嗗疄闄呭彲鑳借繕鍦ㄩ噸杩?|
| 52 | `ChatPage.tsx` | room 鏌ユ壘鐢?rooms.find 浣?rooms 鍙兘涓嶅寘鍚綋鍓嶆埧闂?|

#### 浜斻€佺姸鎬佺鐞嗭紙10 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 53 | `useRoomStore.ts` | fetchRooms() 澶辫触鏃朵笉浼氳缃敊璇姸鎬?|
| 54 | `useRoomStore.ts` | createDirect/createGroup 澶辫触鏃朵笉浼氬洖婊?|
| 55 | `useMessageStore.ts` | fetchMessages 骞跺彂绔炰簤鏉′欢锛宊fetchGen 璁℃暟鍣ㄥ彲鑳芥孩鍑?|
| 56 | `useMessageStore.ts` | prependMessage 妫€鏌ラ噸澶嶇敤 msg.id锛屼絾涓嶅悓娑堟伅鍙兘鏈夌浉鍚?id |
| 57 | `useMessageStore.ts` | reset() 娓呯┖鎵€鏈夌姸鎬佷絾涓嶄細鍙栨秷杩涜涓殑 fetch |
| 58 | `useUIStore.ts` | sidebarOpen 榛樿鍊肩敤 window.innerWidth >= 768锛孲SR 鏃?window 鏈畾涔?|
| 59 | `useUIStore.ts` | persist 鎸佷箙鍖?theme 浣嗗垏鎹富棰樹笉浼氱珛鍗崇敓鏁堬紙闇€瑕佸埛鏂帮級 |
| 60 | `useOnlineStatus.ts` | MAX_ENTRIES=1000 浣嗗垹闄ら€昏緫鍒犻櫎鍓?N 涓敭涓嶆槸鏈€鏃х殑 |
| 61 | `useMessageStore.ts` | concurrent fetchMessages 璋冪敤鍙兘浜ら敊 prepend/append |
| 62 | `useAuthStore.ts` | 鏃?async 鎿嶄綔 loading 鐘舵€?|

#### 鍏€乁I/UX锛?2 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 63 | `toast.tsx` | toast 鑷姩 3 绉掓秷澶憋紝鐢ㄦ埛鍙兘娌¤瀹?|
| 64 | `toast.tsx` | toast 娌℃湁鏆傚仠鍔熻兘锛堥紶鏍囨偓鍋滀笉鏆傚仠锛?|
| 65 | `toast.tsx` | toast 浣嶇疆鍥哄畾鍦ㄥ彸涓婅鍙兘琚叾浠栧厓绱犻伄鎸?|
| 66 | `LoginForm.tsx` | 瀵嗙爜鍙鍒囨崲鎸夐挳 tabIndex=-1锛岄敭鐩樼敤鎴锋棤娉曟搷浣?|
| 67 | `RegisterForm.tsx` | 纭瀵嗙爜鍜屽瘑鐮佸垎寮€楠岃瘉浣嗘棤瑙嗚鍙嶉 |
| 68 | `Header.tsx` | 绉诲姩绔彍鍗曟寜閽彧鍦?md 浠ヤ笅鏄剧ず浣嗕晶杈规爮榛樿鍦?md 浠ヤ笂鎵撳紑 |
| 69 | `ChatPage.tsx` | reconnecting 鐘舵€?5 绉掑悗鑷姩娑堝け浣嗗疄闄呭彲鑳借繕鍦ㄩ噸杩?|
| 70 | `AppShell.tsx` | Sidebar 鍜?Header 鍥哄畾楂樺害浣嗘秷鎭尯鍩熸病鏈夋渶灏忛珮搴?|
| 71 | `ProfilePage.tsx` | 鏃堕棿鎴虫樉绀烘牸寮忎緷璧栨祻瑙堝櫒 locale 涓嶅彲棰勬祴 |
| 72 | `EmptyState.tsx` | 娌℃湁閲嶈瘯鎸夐挳濡傛灉鍔犺浇澶辫触鏃犳硶閲嶈瘯 |
| 73 | `ErrorBoundary.tsx` | reload 椤甸潰浼氫涪澶辨墍鏈夋湭淇濆瓨鐘舵€?|
| 74 | `LoginPage.tsx` | 椤甸潰鏃?meta title 鎴?description |

#### 涓冦€佸畨鍏ㄦ€э紙10 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 75 | `api/client.ts` | token 瀛樺湪 localStorage 鍙 XSS 绐冨彇 |
| 76 | `api/client.ts` | 401 娓呴櫎 localStorage 浣嗘棤璺ㄦ爣绛鹃〉閫氱煡 |
| 77 | `AuthGuard.tsx` | isAuthenticated 鏉ヨ嚜 localStorage 鍙浼€?|
| 78 | `vite.config.ts` | proxy 閰嶇疆鍙湪寮€鍙戠幆澧冪敓浜х幆澧冮渶姝ｇ‘閰嶇疆 CORS |
| 79 | `RegisterForm.tsx` | 鍓嶇瀵嗙爜楠岃瘉涓嶈冻锛? 浣嶄互涓婏級 |
| 80 | `api/chat.ts` | admin API 璋冪敤涓嶅甫 CSRF 淇濇姢 |
| 81 | `toast.tsx` | toast 娑堟伅鍙兘鍖呭惈 XSS锛堝鏋?message 鏉ヨ嚜鐢ㄦ埛杈撳叆锛?|
| 82 | `MessageItem.tsx` | message.content 鐩存帴娓叉煋鍙兘鍖呭惈 XSS |
| 83 | `useSocket.ts` | longToken 椤甸潰鍒锋柊鍚庝粠 localStorage 鎭㈠鏃犲姞瀵?|
| 84 | `api/client.ts` | 鏃犺姹傞噸璇曢€昏緫鐢ㄤ簬鐬€佹晠闅?|

#### 鍏€佹€ц兘锛?6 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 85 | `useInfiniteScroll.ts` | IntersectionObserver 姣忔 setObserver 閮?disconnect/reconnect 鍙兘闂儊 |
| 86 | `useInfiniteScroll.ts` | loadingRef 鏄?ref 浣嗙粍浠堕噸鏂版覆鏌撴椂鍙兘涓嶄竴鑷?|
| 87 | `MessageList.tsx` | messages.slice().reverse() 姣忔娓叉煋閮藉垱寤烘柊鏁扮粍 |
| 88 | `RoomItem.tsx` | 姣忎釜鎴块棿閮藉垱寤?useOnlineStatus hook锛?000 涓埧闂存椂鎬ц兘宸?|
| 89 | `useOnlineStatus.ts` | 姣忔鍦ㄧ嚎鐘舵€佸彉鍖栭兘鍒涘缓鏂板璞?{...prev} |
| 90 | `App.tsx` | ToastListener 姣忔娓叉煋閮芥坊鍔?绉婚櫎浜嬩欢鐩戝惉鍣?|
| 91 | `api/chat.ts` | 姣忎釜 API 鍑芥暟閮藉垱寤烘柊鐨?URLSearchParams |
| 92 | `api/client.ts` | 姣忎釜璇锋眰閮藉垱寤烘柊鐨?AbortController |
| 93 | `api/client.ts` | 10 绉掕秴鏃跺浜庢參缃戠粶澶煭 |
| 94 | `vite.config.ts` | proxy 娌℃湁閰嶇疆瓒呮椂閲嶈瘯鐢卞墠绔鐞?|
| 95 | `MessageList.tsx` | loading skeleton 娓叉煋 5 涓絾瀹為檯鍙兘鍙渶瑕?3 涓?|
| 96 | `RoomItem.tsx` | displayName 姣忔娓叉煋閮介噸鏂拌绠?|
| 97 | `Sidebar.tsx` | filtered 姣忔娓叉煋閮介噸鏂拌绠?|
| 98 | `useRoomStore.ts` | fetchRooms 鏃犵紦瀛樻瘡娆?mount 閮?fetch |
| 99 | `useMessageStore.ts` | 鏃犳秷鎭紦瀛樺垏鎹㈡埧闂存椂 refetch |
| 100 | `MessageList.tsx` | 鏃犺櫄鎷熸粴鍔ㄦ秷鎭噺澶ф椂 DOM 鑺傜偣杩囧 |

#### 涔濄€佺被鍨?缂栬瘧锛? 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 101 | `types/api.ts` | LoginOkRes 鐨?expires_in 瀛楁鍓嶇鏈娇鐢?|
| 102 | `types/models.ts` | Message.type 鍚庣鍙兘杩斿洖鍏朵粬鍊?|
| 103 | `types/models.ts` | Room.type 鍚庣鍙兘杩斿洖鍏朵粬鍊?|
| 104 | `api/client.ts` | ApiClient.request 杩斿洖 {} as T 绫诲瀷涓嶅畨鍏?|
| 105 | `api/client.ts` | error 瀛楁鍙兘涓嶅瓨鍦ㄤ簬鍝嶅簲浣撲腑 |
| 106 | `types/models.ts` | Room memberIds 瀛楁瀹氫箟浣?API 杩斿洖鍙兘娌℃湁 |
| 107 | `types/api.ts` | AdminSendMessageReq 鐨?type 鍙€変絾鍚庣鍙兘瑕佹眰 |
| 108 | `types/socket.ts` | SocketEvent 绫诲瀷鑱斿悎鍙兘鏈鐩栨墍鏈夋湇鍔＄浜嬩欢 |

#### 鍗併€佹祴璇?鍙闂€э紙13 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 109 | 鍏ㄥ眬 | 鏃犲崟鍏冩祴璇曪紙鍓嶇鏃犳祴璇曟枃浠讹級 |
| 110 | 鍏ㄥ眬 | 鏃?E2E 娴嬭瘯 |
| 111 | `dropdown-menu.tsx` | DropdownMenu Tab 鑱氱劍浣嗘寜閽彲鑳戒笉鍦?tab 椤哄簭涓?|
| 112 | `index.css` | text-muted-foreground 鍦ㄦ煇浜涗富棰樹笅瀵规瘮搴︿笉瓒?|
| 113 | `MessageInput.tsx` | textarea 鍦?iOS 涓婂彲鑳芥棤娉曡嚜鍔ㄨ仛鐒?|
| 114 | `ChatPage.tsx` | headerTitle 鍦ㄥ皬灞忓箷涓婂彲鑳借鎴柇 |
| 115 | 鍏ㄥ眬 | 鎵€鏈夋枃鏈‖缂栫爜涓鸿嫳鏂囨棤 i18n 鏀寔 |
| 116 | `index.html` | 鏈缃?font-family 鍥為€€鍒扮郴缁熼粯璁?|
| 117 | `index.html` | favicon.svg 鏈彁渚?fallback |
| 118 | `index.html` | 娌℃湁 meta description |
| 119 | 鍏ㄥ眬 | 娌℃湁 manifest.json 鏃犳硶瀹夎涓?PWA |
| 120 | 鍏ㄥ眬 | 娌℃湁绂荤嚎缂撳瓨绛栫暐鍒锋柊椤甸潰鍙兘涓㈠け鐘舵€?|
| 121 | 鍏ㄥ眬 | 鏃犵劍鐐圭鐞嗭紙modal/dialog 鎵撳紑鏃舵棤鐒︾偣闄烽槺锛?|

#### 鍗佷竴銆侀儴缃?鏋勫缓锛?2 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 122 | `vite.config.ts` | alias @ 鎸囧悜 import.meta.dirname + "/src" 鏌愪簺 Vite 鐗堟湰涓嶅彲鐢?|
| 123 | `vite.config.ts` | proxy 閲嶅啓 /api 鈫?/api 鍘绘帀 /user 鍓嶇紑浣嗗墠绔矾寰勫凡鏄?/api/v1/... |
| 124 | `vite.config.ts` | /chat-api proxy 鎸囧悜 localhost:9001 浣嗙敓浜х幆澧冮渶瑕佹纭厤缃?|
| 125 | `public/_redirects` | 鍙湁 SPA 鍥為€€娌℃湁缂撳瓨澶?|
| 126 | `components.json` | tailwind config 涓虹┖瀛楃涓蹭娇鐢ㄩ粯璁ら厤缃?|
| 127 | `index.html` | 娌℃湁璁剧疆 theme-color meta |
| 128 | `index.html` | 娌℃湁 preload 鍏抽敭璧勬簮 |
| 129 | `vite.config.ts` | tailwindcss 鎻掍欢鍙兘涓庣敓浜ф瀯寤哄啿绐?|
| 130 | `.gitignore` | 鍓嶇鏋勫缓浜х墿 dist/ 鏈湪 .gitignore 涓?|
| 131 | `package.json` | 鏃?build 鑴氭湰鐨?health check |
| 132 | `frontend/README.md` | 鏄粯璁?Vite 妯℃澘鏈洿鏂颁负姝ら」鐩?|
| 133 | `index.html` | 鏃?aria-live 鍖哄煙鐢ㄤ簬鍔ㄦ€佸唴瀹规洿鏂?|

#### 鍗佷簩銆乁I 缁勪欢/浜や簰锛? 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 134 | `toast.tsx` | success toast 浣跨敤 green-600 鑳屾櫙鍙兘涓嶆弧瓒冲姣斿害瑕佹眰 |
| 135 | `toast.tsx` | error toast 浣跨敤 bg-destructive 渚濊禆涓婚 |
| 136 | `dialog.tsx` | DialogContent 娌℃湁 onEscapeKeyDown 鑷畾涔夊鐞?|
| 137 | `tooltip.tsx` | TooltipContent 娌℃湁 disabled 鐘舵€佹敮鎸?|
| 138 | `scroll-area.tsx` | ScrollArea 娌℃湁 keyboard scroll 鏀寔 |
| 139 | `tabs.tsx` | Tabs 娌℃湁 onChange 鍥炶皟鍙敤鍙楁帶 value |
| 140 | `skeleton.tsx` | Skeleton 娌℃湁 aria-label 鎴?role="progressbar" |
| 141 | `badge.tsx` | Badge 娌℃湁 role="status" 璇箟 |
| 142 | `label.tsx` | Label 娌℃湁 htmlFor 鑷姩鍏宠仈 input |

#### 鍗佷笁銆佺己澶卞姛鑳斤紙8 涓級

| # | 鏂囦欢 | 闂 |
|---|------|------|
| 143 | 鍏ㄥ眬 | 鏃?skip-to-content 閾炬帴锛堥敭鐩樼敤鎴凤級 |
| 144 | 鍏ㄥ眬 | 鏃犲叏灞€閿欒杈圭晫锛堜粎 per-component ErrorBoundary锛?|
| 145 | 鍏ㄥ眬 | 缁勪欢鍗歌浇鏃舵棤璇锋眰鍙栨秷锛圓bortController 鏈?abort锛?|
| 146 | 鍏ㄥ眬 | 鏃犱箰瑙?UI 鏇存柊锛堟秷鎭彂閫佸悗绔嬪嵆鏄剧ず鏃犵‘璁わ級 |
| 147 | 鍏ㄥ眬 | 鏃犳秷鎭凡璇诲洖鎵?閫佽揪鐘舵€佹寚绀?|
| 148 | 鍏ㄥ眬 | 鏃犺緭鍏ヤ腑鎸囩ず鍣紙typing indicator锛?|
| 149 | 鍏ㄥ眬 | 鏃犳秷鎭悳绱㈠姛鑳?|
| 150 | 鍏ㄥ眬 | 鏃犳秷鎭紩鐢?鍥炲鍔熻兘 |
