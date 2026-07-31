# Yingo API 文档

Base URL:
- User Service: `http://localhost:9000`
- Chat Service: `http://localhost:9001`

认证: `Authorization: Bearer <token>`

---

## User Service (:9000)

### 公开端点

#### POST /api/v1/register

注册新用户。首个注册用户自动成为 admin。

**Request:**
```json
{
  "username": "string (2-20字符)",
  "password": "string (8-128字符)",
  "app_id": "string (可选, 默认 'chat')"
}
```

**Response 201:**
```json
{
  "ok": true,
  "user": {
    "id": "1785515228432790",
    "globalName": "alice",
    "appNames": ["chat"],
    "permission": "admin",
    "createdAt": 1785515228432
  }
}
```

**Response 400:** 用户名/密码不符合要求
```json
{ "ok": false, "error": "用户名长度须在 2-20 字符之间" }
```

**Response 409:** 用户名已存在（自动生成 #N 后缀，实际不返回 409）

---

#### POST /api/v1/login

登录获取 Token。

**Request:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response 200:**
```json
{
  "ok": true,
  "user_id": "1785515228432790",
  "short_token": "a1b2c3... (32 hex chars)",
  "long_token": "d4e5f6... (64 hex chars)",
  "expires_in": 3600,
  "permission": "admin"
}
```

- `short_token`: 1 小时有效，用于日常 API
- `long_token`: 30 天有效，用于持久登录

**Response 401:**
```json
{ "ok": false, "error": "用户名或密码错误" }
```

---

#### GET /api/v1/verify

验证 Token 有效性。

**Headers:** `Authorization: Bearer <short_token 或 long_token>`

**Response 200:**
```json
{
  "ok": true,
  "user_id": "1785515228432790",
  "scopes": ["chat:read", "chat:write"],
  "permission": "admin"
}
```

**Response 401:** Token 无效/过期/已撤销
```json
{ "ok": false, "error": "invalid token" }
```

---

### 用户端点 (需 Bearer Token)

#### GET /api/v1/users/me

获取当前登录用户资料。

**Response 200:**
```json
{
  "ok": true,
  "user": {
    "id": "1785515228432790",
    "globalName": "alice",
    "appNames": ["chat"],
    "permission": "admin",
    "online": true,
    "createdAt": 1785515228432,
    "lastOnlineAt": 1785515228432
  }
}
```

---

#### GET /api/v1/tokens/me

获取当前用户的所有 Token。

**Response 200:**
```json
{
  "ok": true,
  "tokens": [
    {
      "id": "1785515512563619",
      "userId": "1785515228432790",
      "scopes": "chat:read chat:write",
      "shortExpires": 1785519112563,
      "longExpires": 1788107512563,
      "createdAt": 1785515512563,
      "revokedAt": null,
      "lastUsedAt": 1785515512563
    }
  ],
  "total": 1
}
```

---

#### POST /api/v1/api-keys

创建 API Key。

**Request:**
```json
{
  "name": "my-app",
  "scopes": ["chat:read"],
  "expires_days": 30
}
```

- `expires_days`: 7, 30, 60, 90, 180

**Response 201:**
```json
{
  "ok": true,
  "key": "mk-a1b2c3... (128+ chars)",
  "name": "my-app",
  "expiresDays": 30,
  "rateLimit": 100,
  "prefix": "mk-"
}
```

**Key 前缀:**
- `mk-`: 开发/测试用 Key
- `rk-`: 生产环境 Key

---

### 内部端点 (需 Internal Key)

#### GET /api/v1/internal/user/:id

供 Chat 服务内部调用。

**Headers:** `x-internal-key: <INTERNAL_API_KEY>`

**Response 200:**
```json
{
  "ok": true,
  "user": {
    "id": "1785515228432790",
    "globalName": "alice",
    "permission": "admin"
  }
}
```

**Response 404:**
```json
{ "ok": false, "error": "用户不存在" }
```

---

### Admin 端点 (需 Admin 权限)

#### GET /api/v1/admin/users

获取用户列表。

**Response 200:**
```json
{
  "ok": true,
  "users": [
    {
      "id": "1785515228432790",
      "globalName": "alice",
      "appNames": ["chat"],
      "permission": "admin",
      "online": true,
      "createdAt": 1785515228432,
      "lastOnlineAt": 1785515228432
    }
  ],
  "total": 1
}
```

---

#### GET /api/v1/admin/users/:id

获取指定用户详情。

**Response 200:** 同上单个用户对象
**Response 404:** 用户不存在

---

#### DELETE /api/v1/admin/users/:id

删除用户及其 Token、API Key。

**Response 200:**
```json
{ "ok": true, "deleted": "1785515228432790" }
```

**Response 400:** 不能删除自己 / 最后管理员
**Response 404:** 用户不存在

---

#### PUT /api/v1/admin/users/:id/permission

修改用户权限。

**Request:**
```json
{ "permission": "admin" }
```

`permission` 值: `"admin"` | `"user"`

**Response 200:**
```json
{ "ok": true, "userId": "1785515228451362", "permission": "admin" }
```

**Response 400:** 不能降低自己权限 / 最后管理员权限

---

#### GET /api/v1/admin/tokens

获取系统所有 Token 列表。

**Response 200:**
```json
{
  "ok": true,
  "tokens": [/* 同 tokens/me 格式 */],
  "total": 5
}
```

---

#### DELETE /api/v1/admin/tokens/:id

撤销指定 Token。

**Response 200:**
```json
{ "ok": true, "revoked": "1785515512563619" }
```

**Response 404:** Token 不存在

---

### 健康检查

#### GET /api/v1/health

存活检查 (Liveness)。

**Response 200:**
```json
{ "ok": true, "service": "user-v1", "uptime": 123.456 }
```

---

#### GET /api/v1/ready

就绪检查 (Readiness)。检查数据库连接。

**Response 200:**
```json
{ "ok": true, "service": "user-v1", "db": "ok" }
```

**Response 503:**
```json
{ "ok": false, "service": "user-v1", "db": "error" }
```

---

#### GET /api/v1/metrics

进程指标。

**Response 200:**
```json
{
  "uptime": 123.456,
  "memory": { "rss": 50000000, "heapUsed": 30000000, "heapTotal": 40000000 },
  "pid": 12345
}
```

---

## Chat Service (:9001)

### 用户端点 (需 Bearer Token)

#### POST /api/v1/login

登录代理，转发到 User Service。

**Request:** 同 User Service /login
**Response:** 同 User Service /login

---

#### POST /api/v1/rooms/direct

创建或获取私聊房间。

**Request:**
```json
{ "targetUserId": "1785515228451362" }
```

**Response 200:**
```json
{
  "ok": true,
  "room": {
    "id": "1785515229795851",
    "type": "direct",
    "name": null,
    "creatorId": "1785515228432790",
    "createdAt": 1785515229795,
    "memberIds": ["1785515228432790", "1785515228451362"]
  }
}
```

**Response 400:** 缺少 targetUserId / 不能与自己私聊

---

#### POST /api/v1/rooms/group

创建群聊房间。

**Request:**
```json
{
  "name": "项目讨论",
  "memberIds": ["1785515228451362", "1785515228466732"]
}
```

- 成员上限: 100 人
- 创建者自动加入

**Response 201:**
```json
{
  "ok": true,
  "room": {
    "id": "1785515230000001",
    "type": "group",
    "name": "项目讨论",
    "creatorId": "1785515228432790",
    "createdAt": 1785515230000,
    "memberIds": ["1785515228432790", "1785515228451362", "1785515228466732"]
  }
}
```

**Response 400:** 名称过长 / 成员过多

---

#### GET /api/v1/rooms

获取当前用户的房间列表。

**Response 200:**
```json
{
  "ok": true,
  "rooms": [/* 房间对象数组 */],
  "total": 3
}
```

---

#### GET /api/v1/rooms/:id

获取房间详情。仅房间成员可访问。

**Response 200:** 房间对象
**Response 403:** 非房间成员
**Response 404:** 房间不存在

---

#### GET /api/v1/rooms/:id/members

获取房间成员列表。仅房间成员可访问。

**Response 200:**
```json
{
  "ok": true,
  "members": ["1785515228432790", "1785515228451362"],
  "total": 2
}
```

---

#### GET /api/v1/rooms/:id/messages

获取消息历史 (Cursor 分页)。

**Query Parameters:**
- `limit`: 每页条数 (1-100, 默认 30)
- `cursor`: 游标 (上一页返回的 cursor)

**Response 200:**
```json
{
  "ok": true,
  "messages": [
    {
      "id": "msg_1785515230000",
      "roomId": "1785515229795851",
      "senderId": "1785515228432790",
      "content": "你好",
      "type": "text",
      "sentAt": 1785515230000
    }
  ],
  "hasMore": true,
  "cursor": "1785515230000"
}
```

---

#### POST /api/v1/rooms/:id/messages

发送消息。

**Request:**
```json
{
  "content": "消息内容",
  "type": "text"
}
```

`type` 值: `"text"` | `"image"` | `"file"` | `"system"`

**Response 201:**
```json
{
  "ok": true,
  "message": {
    "id": "msg_1785515230000",
    "roomId": "1785515229795851",
    "senderId": "1785515228432790",
    "content": "消息内容",
    "type": "text",
    "sentAt": 1785515230000
  }
}
```

**Response 403:** 非房间成员
**Response 400:** 内容为空 / 类型无效

---

### Admin 端点 (需 Admin 权限)

#### GET /api/v1/admin/rooms

获取所有房间列表。

**Response 200:**
```json
{
  "ok": true,
  "rooms": [/* 房间对象 */],
  "total": 10
}
```

---

#### GET /api/v1/admin/rooms/:id/members

获取指定房间成员。

---

#### GET /api/v1/admin/rooms/:id/messages

查看指定房间消息 (绕过成员检查)。

**Query Parameters:** 同 /rooms/:id/messages

---

#### POST /api/v1/admin/rooms/:id/messages

代理发送消息 (以管理员身份)。

**Request:** 同 /rooms/:id/messages

---

#### POST /api/v1/admin/rooms/direct

管理员创建私聊 (指定双方)。

**Request:**
```json
{
  "user1Id": "1785515228432790",
  "user2Id": "1785515228451362"
}
```

---

#### POST /api/v1/admin/rooms/group

管理员创建群组 (指定创建者)。

**Request:**
```json
{
  "name": "项目讨论",
  "creatorId": "1785515228432790",
  "memberIds": ["1785515228451362"]
}
```

---

#### POST /api/v1/admin/rooms/:id/members

添加房间成员。

**Request:**
```json
{ "userId": "1785515228466732" }
```

---

#### DELETE /api/v1/admin/rooms/:roomId/members/:userId

移除房间成员。

---

#### DELETE /api/v1/admin/rooms/:id

删除房间 (级联删除消息和成员关系)。

---

#### GET /api/v1/admin/stats

获取系统统计。

**Response 200:**
```json
{
  "ok": true,
  "stats": {
    "totalRooms": 10,
    "totalMessages": 500,
    "totalUsers": 50,
    "onlineUsers": 5
  }
}
```

---

### 健康检查

同 User Service: `/health`, `/ready`, `/metrics`

---

## WebSocket (Socket.IO)

### 连接

```javascript
const socket = io("http://localhost:9001", {
  auth: { token: "your_short_token" }
});
```

### 事件

#### v1:join (client → server)

加入房间。

```javascript
socket.emit("v1:join", { roomId: "room_id" });
```

**响应:** 成功加入或 `v1:error`

---

#### v1:leave (client → server)

离开房间。

```javascript
socket.emit("v1:leave", { roomId: "room_id" });
```

---

#### v1:message (双向)

发送/接收消息。

```javascript
// 发送
socket.emit("v1:message", {
  roomId: "room_id",
  content: "你好",
  type: "text"
}, (ack) => {
  // ack: { ok: true, messageId: "msg_xxx" }
});

// 接收
socket.on("v1:message", (msg) => {
  // msg: { roomId, senderId, content, type, sentAt, id }
});
```

---

#### v1:online (server → client)

在线状态变更通知。

```javascript
socket.on("v1:online", (data) => {
  // data: { userId: "xxx", online: true/false }
});
```

---

#### v1:error (server → client)

错误通知。

```javascript
socket.on("v1:error", (data) => {
  // data: { message: "error description" }
});
```

---

## 错误码

| HTTP 状态码 | 含义 |
|------------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 无效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

## 通用错误响应格式

```json
{
  "ok": false,
  "error": "错误描述"
}
```

## 速率限制

- API Key: 100 次/分钟
- Token: 无硬性限制，建议客户端控制频率

## 分页

消息接口使用 Cursor 分页:

```
GET /api/v1/rooms/:id/messages?limit=30
GET /api/v1/rooms/:id/messages?limit=30&cursor=<上一页返回的cursor>
```

- `hasMore: true` 表示还有更多数据
- `cursor` 是下一页的起始位置
- 按 `sentAt` 降序排列
