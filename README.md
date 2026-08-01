# Yingo Server

瀹炴椂鑱婂ぉ鍚庣绯荤粺锛屽井鏈嶅姟鏋舵瀯銆侳astify + Socket.IO + PostgreSQL + Redis銆?
## 鏈嶅姟

| 鏈嶅姟 | 绔彛 | 鑱岃矗 |
|------|------|------|
| `user/` | 9000 | 鐢ㄦ埛娉ㄥ唽銆佺櫥褰曘€乀oken銆佹潈闄愮鐞?|
| `chat/` | 9001 | 瀹炴椂娑堟伅銆佹埧闂淬€乄ebSocket |
| `frontend/` | - | 闈欐€佸墠绔?SPA (Netlify) |
| `debug/` | - | Python 闆嗘垚娴嬭瘯妗嗘灦 |

## 鎶€鏈爤

- **杩愯鏃?*: Node.js 22+
- **妗嗘灦**: Fastify 5
- **ORM**: Drizzle ORM
- **鏁版嵁搴?*: PostgreSQL 16 + Redis 7
- **瀹炴椂閫氫俊**: Socket.IO 4
- **璇█**: TypeScript (ES2022, 涓ユ牸妯″紡)
- **娴嬭瘯**: Vitest (鍗曞厓) + Python requests/socketio (闆嗘垚)

## 浠ｇ爜缁撴瀯

```
user/src/                          chat/src/
鈹溾攢鈹€ index.ts   鈥?鏈嶅姟鍚姩          鈹溾攢鈹€ index.ts    鈥?鏈嶅姟鍚姩+Socket.IO
鈹溾攢鈹€ routes.ts  鈥?REST 璺敱         鈹溾攢鈹€ routes.ts   鈥?REST 璺敱
鈹溾攢鈹€ core.ts    鈥?涓氬姟閫昏緫          鈹溾攢鈹€ core.ts     鈥?娑堟伅/鎴块棿涓氬姟閫昏緫
鈹溾攢鈹€ db.ts      鈥?鏁版嵁搴撹繛鎺?       鈹溾攢鈹€ api.ts      鈥?User Service 璋冪敤闅旂
鈹溾攢鈹€ schema.ts  鈥?琛ㄥ畾涔?           鈹溾攢鈹€ socket.ts   鈥?WebSocket 浜嬩欢澶勭悊
鈹溾攢鈹€ types.ts   鈥?绫诲瀷瀹氫箟          鈹溾攢鈹€ redis.ts    鈥?Redis 杩炴帴
鈹斺攢鈹€ debug-config.ts               鈹溾攢鈹€ schema.ts   鈥?琛ㄥ畾涔?                                  鈹溾攢鈹€ types.ts    鈥?绫诲瀷瀹氫箟
                                  鈹斺攢鈹€ debug-config.ts
```

**渚濊禆鍏崇郴**: Chat 鏈嶅姟浠呴€氳繃 `api.ts` 璋冪敤 User Service锛屽畬鍏ㄩ殧绂汇€?
## 蹇€熷紑濮?
### 鐜瑕佹眰

- Node.js 22+
- PostgreSQL 16+ (鏁版嵁搴? `cold_user`, `cold_chat`)
- Redis 7+

### 鏈湴寮€鍙?
```bash
# 瀹夎渚濊禆
cd user && npm install
cd ../chat && npm install

# 鍚屾鏁版嵁搴?cd user && npx drizzle-kit push
cd ../chat && npx drizzle-kit push

# 鍚姩鏈嶅姟
cd user && npx tsx src/index.ts   # :9000
cd chat && npx tsx src/index.ts   # :9001
```

### Docker

```bash
cd user && docker compose up -d
cd ../chat && docker compose up -d
```

## 鐜鍙橀噺

| 鍙橀噺 | 榛樿鍊?| 璇存槑 |
|------|--------|------|
| `DATABASE_URL` | `postgres://yingo:yingo123@localhost:5432/cold_user` | PostgreSQL 杩炴帴涓?|
| `REDIS_URL` | `redis://localhost:6379` | Redis 杩炴帴涓?(浠?Chat) |
| `USER_SERVICE_URL` | `http://localhost:9000` | User Service 鍦板潃 (浠?Chat) |
| `PEPPER_SECRET` | `dev-pepper-change-in-production` | 瀵嗙爜 Pepper |
| `TOKEN_SECRET` | `dev-token-secret-change-in-production` | Token HMAC 瀵嗛挜 |
| `CORS_ORIGINS` | `http://localhost:3000` | CORS 鐧藉悕鍗?(閫楀彿鍒嗛殧) |
| `LOG_LEVEL` | `info` | 鏃ュ織绾у埆 |
| `SSL_CERT` / `SSL_KEY` | - | HTTPS 璇佷功璺緞 |
| `INTERNAL_API_KEY` | `dev-internal-key-change-in-production` | 鍐呴儴鎺ュ彛瀵嗛挜 |

## 鏋舵瀯

### 鐑?鍐锋秷鎭?
```
鍙戦€?鈫?Redis (鐑尯, TTL=10min)
            鈫?姣?0s褰掓。
       PostgreSQL (鍐峰尯, 鎸佷箙鍖?
```

- 5鍒嗛挓鍐呮秷鎭蛋 Redis锛岃鍐欏揩
- 瓒呮椂鑷姩褰掓。鍒?PostgreSQL
- 杩涚▼閲嶅惎涓嶄涪澶?
### Token 浣撶郴

```
鐧诲綍 鈫?绛惧彂:
  short_token (32 hex, 1h 鏈夋晥)
  long_token  (64 hex, 30d 鏈夋晥)
楠岃瘉 鈫?HMAC-SHA256 鍔犵洂姣斿
```

## API 姒傝

瀹屾暣鎺ュ彛鏂囨。瑙?[API.md](./API.md)

**User Service (16 绔偣)**

| 绔偣 | 鏉冮檺 | 璇存槑 |
|------|------|------|
| POST /register | 鍏紑 | 娉ㄥ唽 (棣栫敤鎴疯嚜鍔?admin) |
| POST /login | 鍏紑 | 鐧诲綍 鈫?鍙?Token |
| GET /verify | Bearer | Token 楠岃瘉 |
| GET /users/me | Bearer | 褰撳墠鐢ㄦ埛 |
| GET /tokens/me | Bearer | Token 鍒楄〃 |
| POST /api-keys | Bearer | 鍒涘缓 API Key |
| GET /internal/user/:id | 鍐呴儴瀵嗛挜 | 鐢ㄦ埛鏌ヨ |
| GET/DELETE /admin/users | Admin | 鐢ㄦ埛绠＄悊 |
| PUT /admin/users/:id/permission | Admin | 淇敼鏉冮檺 |
| GET/DELETE /admin/tokens | Admin | Token 绠＄悊 |
| GET /health, /ready, /metrics | 鍏紑 | 鍋ュ悍妫€鏌?|

**Chat Service (19 绔偣 + 5 WebSocket 浜嬩欢)**

| 绔偣 | 鏉冮檺 | 璇存槑 |
|------|------|------|
| POST /rooms/direct | Bearer | 鍒涘缓绉佽亰 |
| POST /rooms/group | Bearer | 鍒涘缓缇よ亰 |
| GET /rooms/:id/messages | Bearer | 娑堟伅鍘嗗彶 |
| POST /rooms/:id/messages | Bearer | 鍙戦€佹秷鎭?|
| GET/DELETE /admin/rooms | Admin | 鎴块棿绠＄悊 |
| POST /admin/rooms/:id/members | Admin | 鎴愬憳绠＄悊 |
| GET /admin/stats | Admin | 缁熻 |

**WebSocket**: `v1:join`, `v1:leave`, `v1:message`, `v1:online`, `v1:error`

## 鎬ц兘

| 鎸囨爣 | 鏁板€?|
|------|------|
| HTTP 骞跺彂 | 200 鍏ㄨ繃 |
| 鍚炲悙閲?| 88 rps |
| 鍝嶅簲寤惰繜 | p50=16ms, p99=2.1s |
| 鏀拺鐢ㄦ埛 | 1700+ (鑱婂ぉ鍦烘櫙) |

## 閮ㄧ讲

瑙?[DEPLOY.md](./DEPLOY.md)

## 鍓嶇

React 19 + TypeScript + Vite SPA锛岄儴缃插埌 Netlify锛坄yingo-server/chats-apps` 浠撳簱锛夈€?
### 鎶€鏈爤

- React 19 + TypeScript + Vite
- Zustand锛堢姸鎬佺鐞嗭級+ persist 涓棿浠?- Tailwind CSS 4 + shadcn/ui 缁勪欢
- Socket.IO Client锛堝疄鏃堕€氫俊锛?- React Router v7锛堣矾鐢憋級
- Radix UI 鍘熻锛圖ialog/Dropdown/Tooltip 绛夛級

### Bug 瀹℃煡

宸插彂鐜?**150 涓姛鑳?bug**锛岃瑙?[DEPLOY.md](./DEPLOY.md#鍓嶇-bug-鍒楄〃150-涓?銆?
涓昏绫诲埆锛?- API/缃戠粶灞?12 涓?| 璁よ瘉/鎺堟潈 13 涓?| 娑堟伅/鑱婂ぉ 15 涓?- 鎴块棿/缇ょ粍 12 涓?| 鐘舵€佺鐞?10 涓?| UI/UX 12 涓?- 瀹夊叏鎬?10 涓?| 鎬ц兘 16 涓?| 绫诲瀷/缂栬瘧 8 涓?- 娴嬭瘯/鍙闂€?13 涓?| 閮ㄧ讲/鏋勫缓 12 涓?| UI 缁勪欢 9 涓?| 缂哄け鍔熻兘 8 涓?
## 瀹夊叏

- Helmet 瀹夊叏澶?(CSP, HSTS, X-Frame-Options)
- CORS 鍙厤缃?- 璇锋眰浣撻檺鍒?(User: 1MB, Chat: 64KB)
- Token HMAC-SHA256 + Salt 瀛樺偍
- API Key 128 浣嶉殢鏈?- 棣栫敤鎴疯嚜鍔?admin + advisory lock 闃插苟鍙?- Token 纰版挒鑷姩閲嶈瘯
- 璇锋眰杩借釜 ID (UUID)
- Graceful Shutdown (SIGINT/SIGTERM)

## 娴嬭瘯

```bash
cd debug
python main.py   # 杩愯 1253 椤归泦鎴愭祴璇?```
