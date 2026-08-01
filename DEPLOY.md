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

### 鍓嶇缂洪櫡娓呭崟

浠ヤ笅涓?*蹇呴』淇**鐨勫姛鑳界己闄凤紝鎸変弗閲嶇▼搴︽帓搴忋€?
#### P0 - 浼氬鑷村穿婧?鏁版嵁涓㈠け

| # | 鏂囦欢:琛?| 缂洪櫡 | 褰卞搷 |
|---|---------|------|------|
| 1 | `MessageItem.tsx` | `senderName.slice(0,2).toUpperCase()` senderName 涓虹┖瀛楃涓叉椂 `""` 鍙樹负 `"undefined"` 鏄剧ず | 澶村儚鏄剧ず寮傚父 |
| 2 | `MessageItem.tsx` | `message.senderId === user?.id` 褰?user 涓?null 鏃?crash | 椤甸潰鐧藉睆 |
| 3 | `ChatPage.tsx` | `rooms.find(r => r.id === currentRoomId)` 鎵句笉鍒?room 鏃跺悗缁叏閮ㄨВ鏋?crash | 椤甸潰鐧藉睆 |
| 4 | `useUIStore.ts` | `window.innerWidth >= 768` 鍦?SSR/鏃?window 鐜 crash | 棣栧睆鐧藉睆 |
| 5 | `useMessageStore.ts` | 骞跺彂 fetchMessages 浜ら敊鎵ц锛屾柊璇锋眰鐨?prepend 琚棫璇锋眰瑕嗙洊 | 娑堟伅鍒楄〃閿欎贡 |
| 6 | `useRoomStore.ts` | createDirect/createGroup 澶辫触鏃舵棤鍥炴粴锛孶I 宸叉洿鏂颁絾鏁版嵁鏈垱寤?| 鎴块棿鍒楄〃鑴忔暟鎹?|

#### P1 - 鍔熻兘鎬х己闄凤紙鐢ㄦ埛鍙閿欒琛屼负锛?
| # | 鏂囦欢 | 缂洪櫡 | 褰卞搷 |
|---|------|------|------|
| 7 | `api/client.ts` | chat API baseUrl 榛樿 ""锛宍/chat-api` proxy 浠庢湭瑙﹀彂 | 寮€鍙戠幆澧冩棤娉曡仈璋冭亰澶?|
| 8 | `useSocket.ts` | `chatApiUrl` 榛樿 `${origin}/chat-api`锛岀敓浜х幆澧?Nginx 鏃犳璺敱 | 鐢熶骇鐜 socket 杩炴帴澶辫触 |
| 9 | `useAuthStore.ts` | login() 鍚庣珛鍗?fetchMe()锛宼oken 鍙兘杩樻病鐢熸晥 | 鐧诲綍鍚庡伓灏?401 璺崇櫥褰曢〉 |
| 10 | `ChatPage.tsx` | reconnecting 鐘舵€?5 绉掑悗 `setReconnecting(false)` 浣嗗疄闄呰繕鍦ㄩ噸杩?| 閲嶈繛鎸囩ず鍣ㄨ瀵?|
| 11 | `MessageInput.tsx` | 鍙戦€佸け璐ュ悗 setText(content) 浣嗗厜鏍囦綅缃涪澶?| 鐢ㄦ埛闇€閲嶆柊鐐瑰嚮杈撳叆妗?|
| 12 | `useSocket.ts` | sendMessage 瓒呮椂 10 绉掞紝寮辩綉涓嬪繀鐒惰秴鏃?| 寮辩綉娑堟伅鍙戦€佸け璐?|
| 13 | `CreateRoom.tsx` | `memberIds.length > 0 ? memberIds : undefined` 绌烘暟缁勪紶 undefined | 缇よ亰鍒涘缓鍙傛暟寮傚父 |
| 14 | `Header.tsx` | permission 涓?null 鏃朵笉鏄剧ず admin badge锛屽嵆浣跨敤鎴锋槸 admin | Admin 鍔熻兘涓嶅彲瑙?|
| 15 | `ProfilePage.tsx` | adminGetUser 澶辫触 catch 鍚炴帀閿欒锛岀敤鎴风湅鍒扮┖鐧介〉 | 鏌ョ湅浠栦汉璧勬枡澶辫触鏃犳彁绀?|
| 16 | `useRoomStore.ts` | fetchRooms() 澶辫触鏃犻敊璇姸鎬侊紝UI 鏃犱换浣曞弽棣?| 鎴块棿鍒楄〃鍔犺浇澶辫触闈欓粯 |
| 17 | `MessageList.tsx` | prevMsgCountRef 鍦?reverse 娓叉煋涓?scrollIntoView 瀹氫綅涓嶅噯纭?| 鏂版秷鎭粴鍔ㄥ埌搴曢儴鍋忕Щ |
| 18 | `App.tsx` | ToastListener 姣忔娓叉煋 addEventListener/removeEventListener | 鍐呭瓨娉勬紡 |
| 19 | `api/client.ts` | 缁勪欢鍗歌浇鏃?AbortController 鏈?abort | 鍐呭瓨娉勬紡 + setState after unmount |
| 20 | `useOnlineStatus.ts` | 鍒犻櫎閫昏緫鍒犲墠 N 涓敭涓嶆槸鏈€鏃х殑锛?000 鏉￠檺鍒惰缁曡繃 | Redis 閿棤闄愬闀?|
| 21 | `api/client.ts` | 10 绉掕秴鏃跺お鐭紝澶ф秷鎭?寮辩綉蹇呯劧澶辫触 | 澶ф枃浠朵笂浼犺秴鏃?|
| 22 | `vite.config.ts` | /chat-api proxy 鎸囧悜 localhost:9001 浣?client.ts baseUrl="" 涓嶈Е鍙?| 寮€鍙戠幆澧?proxy 褰㈠悓铏氳 |

#### P2 - 瀹夊叏缂洪櫡

| # | 鏂囦欢 | 缂洪櫡 | 褰卞搷 |
|---|------|------|------|
| 23 | `api/client.ts` | 401 娓呴櫎 localStorage 鍚?redirect /login 鏈繚鐣?returnTo | 鐧诲綍鍚庤烦鍥為椤佃€岄潪鍘熼〉闈?|
| 24 | `MessageItem.tsx` | message.content 鐩存帴娓叉煋鏈浆涔夛紝XSS 椋庨櫓 | 瀛樺偍鍨?XSS |
| 25 | `useSocket.ts` | longToken 浠?localStorage 鎭㈠鏃犲姞瀵?| token 鏄庢枃鏆撮湶 |
| 26 | `useAuthStore.ts` | fetchMe() 澶辫触娓呴櫎鍏ㄩ儴 auth state锛屼笌 client.ts 401 澶勭悊閲嶅 | 鍙岄噸娓呴櫎瀵艰嚧闂儊璺宠浆 |

#### P3 - 绫诲瀷/缂栬瘧缂洪櫡

| # | 鏂囦欢 | 缂洪櫡 | 褰卞搷 |
|---|------|------|------|
| 27 | `api/client.ts` | 闈?JSON 鍝嶅簲杩斿洖 `{} as T`锛岀被鍨嬩笉瀹夊叏 | 杩愯鏃?undefined 璁块棶 |
| 28 | `types/models.ts` | Room memberIds 瀛楁绫诲瀷瀹氫箟浣?API 杩斿洖鍙兘娌℃湁 | 杩愯鏃?undefined |
| 29 | `types/models.ts` | Message.type 纭紪鐮?4 绉嶅€硷紝鍚庣鎵╁睍鏃跺墠绔穿婧?| 鍚庣鏂板娑堟伅绫诲瀷鏃剁櫧灞?|
| 30 | `api/client.ts` | 閿欒澶勭悊缃戠粶閿欒鍜?HTTP 閿欒閮?throw Error 鏃犳硶鍖哄垎 | 鏃犳硶姝ｇ‘澶勭悊涓嶅悓閿欒绫诲瀷 |
