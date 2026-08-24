# 1号员工 官网后端 API 对接文档（App 端）

> 适用对象：1号员工 桌面端（Electron）开发。
> 版本：API v0.5.0 · 更新：2026-08-23
> 基础地址：生产 `https://spec-ai.cn`（**已上线，2026-08-24 起生效**）；联调可用最新部署地址（见 Cloudflare Pages 部署列表）。

---

## 1. 通用约定

- 协议：**HTTPS + JSON**（`Content-Type: application/json`）。
- 鉴权：受保护接口需请求头 `Authorization: Bearer <token>`（登录/注册返回的 JWT）。
- 成功响应：`{ "ok": true, ...业务字段 }`，HTTP 200（创建类亦 200）。
- 失败响应：`{ "ok": false, "error": "<错误码>", "detail"?: 附加信息 }`，HTTP 4xx/5xx。
- 时间戳：统一 **Unix 秒**（整数）。
- 金额：**分**（integer），货币 CNY。
- CORS：允许任意来源（桌面端 fetch 无跨域限制）。

### 错误码一览

| 错误码 | HTTP | 含义 |
|---|---|---|
| `invalid_email` / `invalid_phone` / `invalid_password` | 400 | 格式校验失败 |
| `code_required` | 400 | 缺少验证码 |
| `code_invalid` / `code_used` / `code_expired` | 400 | 验证码错误/已用/过期 |
| `invalid_target` | 400 | 目标（邮箱/手机）不合法 |
| `already_registered` | 409 | 账号已注册 |
| `bad_credentials` | 401 | 邮箱或密码错误 |
| `account_not_registered` | 404 | 手机号未注册（验证码正确但无账号） |
| `account_not_found` | 404 | 重置密码时邮箱不存在 |
| `invalid_method` | 400 | 操作与账号类型不符（如手机账号调修改密码接口） |
| `unauthorized` | 401 | 未登录或 token 无效/过期 |
| `too_many_attempts` / `too_many_requests` | 429 | 触发限流（10 分钟 5 次失败 / 每小时 5 次发码） |
| `account_disabled` | 403 | 账号被禁用 |
| `invalid_plan` / `plan_free` | 400 | 计划不合法 / 免费版无需下单 |
| `order_not_found` | 404 | 订单不存在 |
| `order_already_paid` | 409 | 订单已支付 |
| `device_limit` | 403 | 设备数超限（detail.max 为上限） |
| `invalid_device` | 400 | 设备标识不合法 |
| `forbidden` | 403 | 无权操作（含非开发模式调用激活接口） |
| `payment_not_configured` | 501 | 支付通道未接入（预留） |
| `db_unavailable` | 503 | 数据库不可用 |
| `internal` | 500 | 服务内部错误 |
| `not_found` | 404 | 接口不存在 |

---

## 2. 认证接口

### 2.1 发送验证码

```
POST /api/auth/send-code
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `target` | string | 是 | 邮箱或手机号（国内手机号 `1[3-9]\d{9}`） |
| `purpose` | string | 是 | `register`（注册）或 `login`（登录） |

响应 `200`：

```json
{ "ok": true, "delivered": true }
```

- `delivered=false` 表示验证码通道未配置（生产需配置邮件/短信服务）。
- 同一目标每小时最多 5 次（超限 `too_many_requests`）。
- 验证码 6 位数字、10 分钟有效、一次性。

### 2.2 注册

```
POST /api/auth/register
```

请求体（二选一方式）：

```json
{ "method": "email", "email": "user@example.com", "password": "password123", "code": "123456" }
{ "method": "phone", "phone": "13800138000", "code": "123456" }
```

| 字段 | 说明 |
|---|---|
| `method` | `email` 或 `phone` |
| `password` | 仅 email 方式，8-128 位 |
| `code` | 必须先 `send-code` 获取（purpose=register） |

响应 `200`：

```json
{
  "ok": true,
  "token": "<JWT>",
  "user": { "id": 1, "email": "user@example.com", "phone": null, "plan": "free", "planExpiresAt": null, "hasPassword": true, "createdAt": 1756000000 }
}
```

### 2.3 登录

```
POST /api/auth/login
```

请求体：

```json
{ "method": "email", "email": "user@example.com", "password": "password123" }
{ "method": "phone", "phone": "13800138000", "code": "123456" }
```

响应 `200`：与注册相同（`token` + `user`）。

- 密码错误 5 次/10 分钟触发 `too_many_attempts`。
- token 有效期 **30 天**；过期后调 `/api/me` 返回 401，需重新登录。

### 2.4 当前用户

```
GET /api/me
Authorization: Bearer <token>
```

响应 `200`：

```json
{ "ok": true, "user": { "id": 1, "email": "user@example.com", "phone": null, "plan": "free", "planExpiresAt": null, "createdAt": 1756000000 } }
```

> 用途：启动时校验 token 是否有效；401 即失效。

### 2.5 重置密码（邮箱账号）

```
POST /api/auth/send-code      # { "target": "user@example.com", "purpose": "reset" }
POST /api/auth/reset-password # { "email": "user@example.com", "code": "123456", "newPassword": "newpassword456" }
```

- 先以 `purpose: "reset"` 发码，再调用 `reset-password`。
- 仅支持邮箱账号（手机账号无密码，登录走验证码即可）。
- 成功后旧密码立即失效，**并撤销该账号全部已签发 token**。响应 `200`：`{ "ok": true, "message": "password_reset" }`

### 2.6 修改密码 / 会话管理 / 绑定 / 注销（均需登录）

```
POST /api/auth/change-password  # { "oldPassword": "...", "newPassword": "..." }  （仅邮箱账号）
POST /api/auth/revoke-all       # {} 撤销该账号全部会话（所有已签发 token 立即失效）
POST /api/auth/bind             # { "method": "email"|"phone", "email"|"phone": "...", "code": "..." } 绑定/换绑第二种身份
POST /api/auth/deactivate       # { "password": "..." } 邮箱账号；{ "code": "..." } 手机账号（login 用途验证码）→ 注销（软删除）
```

- 修改密码、重置密码、注销都会使该账号**所有已签发 token 失效**（JWT 内含 token 版本号，服务端版本递增即撤销）。
- `bind` 前需先 `send-code`（`purpose: "bind"`）向新目标发码验证；新目标已被他人占用返回 409。
- 注销后账号 `status=disabled`，无法再登录。
- `user.hasPassword`：邮箱账号为 `true`、纯手机账号为 `false`。App 端据此决定展示「修改密码」还是「验证码」流程（手机账号调 `change-password` 会返回 `invalid_method`(400)）。

---

## 3. 使用统计

```
GET /api/stats
Authorization: Bearer <token>
```

响应 `200`：

```json
{
  "ok": true,
  "stats": {
    "totalLogins": 12,
    "lastLoginAt": 1756010000,
    "uniqueDevices": 2,
    "methods": [ { "method": "email", "count": 10 }, { "method": "phone", "count": 2 } ]
  },
  "recentLogins": [ { "method": "email", "ip": "1.2.3.4", "ua": "Mozilla/5.0 ...", "at": 1756010000 } ]
}
```

---

## 4. 计划与订阅

### 4.1 计划列表（公开，无需登录）

```
GET /api/plans
```

响应 `200`：

```json
{
  "ok": true,
  "plans": [
    { "id": "free", "monthlyCents": 0, "yearlyCents": 0 },
    { "id": "pro", "monthlyCents": 1990, "yearlyCents": 19900 }
  ],
  "days": { "monthly": 30, "yearly": 365 }
}
```

### 4.2 当前订阅状态

```
GET /api/subscription
Authorization: Bearer <token>
```

响应 `200`：

```json
{ "ok": true, "subscription": { "plan": "free", "expiresAt": null, "status": "none" } }
```

`status`：`active`（生效中）/ `expired`（已过期）/ `none`（从未订阅）。

### 4.3 创建订单

```
POST /api/subscription/orders
Authorization: Bearer <token>
```

请求体：`{ "plan": "pro", "period": "monthly" }`（`period`: `monthly` | `yearly`）

响应 `200`：

```json
{
  "ok": true,
  "order": { "orderNo": "SAXXXXXXXX", "plan": "pro", "period": "monthly", "amountCents": 1990, "currency": "CNY", "status": "pending", "createdAt": 1756010000 },
  "payment": { "provider": null, "status": "pending_integration", "message": "payment_channel_pending" },
  "devMode": false
}
```

> ⚠️ 当前为**订阅框架预留阶段**（决策 1-C）：`payment.provider` 为 null，支付通道未接入。`devMode=true` 时（联调环境）可调用 4.5 激活订单走通链路。

### 4.4 订单列表

```
GET /api/subscription/orders
Authorization: Bearer <token>
```

响应 `200`：

```json
{
  "ok": true,
  "orders": [
    { "orderNo": "SAXXXXXXXX", "plan": "pro", "amountCents": 1990, "currency": "CNY", "status": "pending", "provider": null, "createdAt": 1756010000, "paidAt": null }
  ]
}
```

### 4.5 激活订单（仅开发模式）

```
POST /api/subscription/activate
Authorization: Bearer <token>
```

请求体：`{ "orderNo": "SAXXXXXXXX" }`

- 仅当服务端 `DEV_MODE=1` 时可用；生产返回 `forbidden`(403)。
- 作用：模拟支付成功 → 订单置 `paid`、写入订阅记录、延长 `users.plan_expires_at`（月付 +30 天 / 年付 +365 天，续订从当前到期时间顺延）。

响应 `200`：

```json
{ "ok": true, "subscription": { "plan": "pro", "expiresAt": 1758610000, "status": "active" }, "orderNo": "SAXXXXXXXX" }
```

### 4.6 支付回调（预留）

```
POST /api/payment/notify
```

- 预留接口：微信支付/支付宝官方通道接入后，商户回调将落在此处（当前返回 501 `payment_not_configured`）。
- 接入时需在服务端校验签名、幂等处理（订单状态机 pending → paid），勿在客户端信任回调结果。

---

## 5. 许可与设备（App 启动鉴权核心）

### 5.1 许可检查

```
POST /api/license/check
Authorization: Bearer <token>
```

响应 `200`：

```json
{
  "ok": true,
  "license": {
    "plan": "pro",
    "status": "active",
    "expiresAt": 1758610000,
    "features": {
      "maxParallelTasks": 5,
      "maxDevices": 3,
      "hardwareAccess": true,
      "prioritySupport": true,
      "storageGb": 100
    }
  },
  "devices": [
    { "deviceId": "dev-a", "name": "PC", "lastSeenAt": 1756010000, "createdAt": 1756010000 }
  ]
}
```

权益矩阵（`features`，服务端按订阅计划返回）：

| 特性 | free | pro |
|---|---|---|
| `maxParallelTasks` 并行任务数 | 1 | 5 |
| `maxDevices` 设备上限 | 1 | 3 |
| `hardwareAccess` 硬件接入 | false | true |
| `prioritySupport` 优先响应 | false | true |
| `storageGb` 存储配额(GB) | 2 | 100 |

**App 端建议**：
- 启动时调用本接口获取 `features` 并缓存（本地持久化），离线时按缓存执行。
- 订阅过期后 `license.status` 变 `expired`、`plan` 回退 `free`——客户端应据此降级功能并提示续费。

### 5.2 注册/更新设备

```
POST /api/license/register-device
Authorization: Bearer <token>
```

请求体：`{ "deviceId": "<机器唯一标识>", "name": "我的电脑" }`

- `deviceId`：建议用稳定且可复现的机器指纹（如主板序列号/系统标识的 SHA-256），勿用随机 UUID（重装即换设备）。
- 幂等：同一 `deviceId` 重复注册只更新时间，不新增计数。
- 超限：返回 `403 { ok:false, error:"device_limit", detail:{ max: 3 } }`——App 应展示设备列表让用户移除旧设备。

响应 `200`：

```json
{ "ok": true, "allowed": true, "max": 3, "devices": [ ...完整设备列表 ] }
```

### 5.3 移除设备

```
POST /api/license/remove-device
Authorization: Bearer <token>
```

请求体：`{ "deviceId": "<机器唯一标识>" }`

响应 `200`：`{ "ok": true, "removed": "<deviceId>" }`

---

## 6. 推荐对接流程

### 6.1 首次使用（注册）

```
App 启动 → 无 token？
  └─ 用户选择注册方式
     ├─ 邮箱：POST /api/auth/send-code {target: email, purpose: "register"}
     │        → POST /api/auth/register {method:"email", email, password, code}
     └─ 手机：POST /api/auth/send-code {target: phone, purpose: "register"}
              → POST /api/auth/register {method:"phone", phone, code}
  → 保存 token → POST /api/license/register-device {deviceId: 机器指纹}
  → POST /api/license/check 获取权益 → 进入主界面
```

### 6.2 日常启动

```
POST /api/license/check
  ├─ 200 → 更新本地缓存的 features/plan → 进入主界面
  └─ 401 → token 失效 → 引导重新登录（6.3）
```

### 6.3 登录

```
邮箱：POST /api/auth/login {method:"email", email, password}
手机：POST /api/auth/send-code {target: phone, purpose:"login"}
     → POST /api/auth/login {method:"phone", phone, code}
→ 保存 token → 重复 6.2
```

### 6.4 订阅升级（当前框架阶段）

```
用户点击订阅 → POST /api/subscription/orders {plan:"pro", period:"monthly"}
  → 展示订单（金额/订单号）+ "支付渠道接入中"提示
  → 支付通道上线后：跳转收银台 → 服务端回调 /api/payment/notify 落单 → 客户端轮询
     GET /api/subscription 直到 status=active
```

---

## 7. 安全说明

- **密码**：客户端仅经 TLS 传输明文密码，服务端 PBKDF2-SHA256（21 万次迭代）哈希存储，客户端不保存、不本地缓存密码。
- **token 存储**：桌面端建议用 Electron `safeStorage`（系统级加密）持久化 JWT；不要明文落盘。
- **限流**：登录失败 5 次/10 分钟、发码 5 次/小时/目标、**注册 10 次/小时/IP**，客户端应提示而非无限重试。
- **验证码**：一次性、10 分钟过期，服务端强校验，客户端勿自行校验。
- **设备指纹**：勿用浏览器 UA 等易变值；建议 CPU/主板/系统安装 ID 的组合哈希。
- **回调安全**（未来支付接入时）：`/api/payment/notify` 必须验签、查重、以服务端为准；客户端仅展示，不直接改订阅状态。

---

## 8. 联调与上线配置

| 配置项 | 位置 | 说明 |
|---|---|---|
| `JWT_SECRET` | Cloudflare 控制台 → 项目 → 设置 → 变量（secret） | **必须**配置，否则每次部署后 token 失效 |
| `DEV_MODE` | 同上（plain） | 联调 `1`，生产 `0` |
| `RESEND_API_KEY` / `MAIL_FROM` | 同上（secret） | 可选：验证码邮件通道（未配置时验证码不投递，仅日志） |
| `SMS_WEBHOOK_URL` | 同上（secret） | 可选：短信通道钩子，服务端向该地址 POST `{phone, code, purpose}` |
| 短信通道 | 待接入 | 手机验证码生产通道需短信服务商（预留 `sendCode` 扩展点） |

**联调地址**：`https://spec-ai.cn`（上线后）；平台开通前可用 Cloudflare Pages 最新部署 URL（`https://<deployment-id>.spec-ai-website.pages.dev`）。
