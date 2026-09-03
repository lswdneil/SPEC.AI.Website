/**
 * 1号员工 官网后端（Cloudflare Pages advanced mode worker）
 *
 * - /api/*     业务接口：健康检查、注册/登录/验证码、账户信息、统计、订阅、许可
 * - 其余路径    回退到静态资源（env.ASSETS），现有页面完全不受影响
 * - 依赖        D1 数据库绑定（变量名 DB）+ Web Crypto（零外部依赖）
 *
 * 安全约定：密码 PBKDF2-SHA256（10 万次迭代，Workers 上限）哈希、JWT(HMAC-SHA256) 鉴权、
 * 验证码一次性使用（10 分钟过期）、登录/发码限流。
 * 环境变量：JWT_SECRET（必配，生产）、DEV_MODE（开发调试返回验证码）、
 *           RESEND_API_KEY（可选，邮箱验证码发送通道）、
 *           ALIYUN_AK_ID / ALIYUN_AK_SECRET / ALIYUN_SMS_SIGN / ALIYUN_SMS_TEMPLATE
 *           （可选，阿里云"短信认证"SendSmsVerifyCode 通道，号码认证服务 dypnsapi）。
 */

const VERSION = '0.7.0';
const CODE_TTL = 600;          // 验证码有效期 10 分钟
const CODE_MAX_SEND = 5;       // 每目标每小时最多发码次数
const LOGIN_FAIL_LIMIT = 5;    // 10 分钟内失败次数上限
const LOGIN_FAIL_WINDOW = 600;
const JWT_TTL = 30 * 24 * 3600; // token 30 天
const PWD_ITER = 100000;  // Workers Runtime PBKDF2 迭代上限为 100000（超过会抛错）；本地 Node 无此限制，故测试全绿而生产挂

// 订阅计划（价格为占位，可按需调整；单位：分；年付 = 月付 × 10）
const PLANS = {
  Free: { id: 'Free', monthlyCents: 0, yearlyCents: 0 },
  Lite: { id: 'Lite', monthlyCents: 6990, yearlyCents: 69900 },
  Pro: { id: 'Pro', monthlyCents: 9990, yearlyCents: 99900 },
  Max: { id: 'Max', monthlyCents: 19990, yearlyCents: 199900 }
};
const SUBSCRIPTION_DAYS = { monthly: 30, yearly: 365 };

// 各计划的权益矩阵（App 端据此解锁功能）
const FEATURES = {
  Free: { maxParallelTasks: 1, maxDevices: 1, hardwareAccess: false, prioritySupport: false, storageGb: 2 },
  Lite: { maxParallelTasks: 2, maxDevices: 2, hardwareAccess: true, prioritySupport: false, storageGb: 20 },
  Pro: { maxParallelTasks: 5, maxDevices: 3, hardwareAccess: true, prioritySupport: true, storageGb: 100 },
  Max: { maxParallelTasks: 10, maxDevices: 5, hardwareAccess: true, prioritySupport: true, storageGb: 500 }
};

// 档位归一化：兼容存量小写 free/pro 数据，统一为首字母大写 ID；未知档位返回 null（由调用方决定兜底或拒绝）
function normalizePlan(p) {
  if (p === 'free' || p === 'Free') return 'Free';
  if (p === 'lite' || p === 'Lite') return 'Lite';
  if (p === 'pro' || p === 'Pro') return 'Pro';
  if (p === 'max' || p === 'Max') return 'Max';
  return null;
}

// 读取展示/权益用：未知档位一律兜底 Free（存量脏数据不崩）
function safePlan(p) {
  return normalizePlan(p) || 'Free';
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    pass_hash TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_expires_at INTEGER,
    token_version INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    started_at INTEGER NOT NULL,
    expires_at INTEGER,
    provider TEXT,
    provider_order TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_no TEXT UNIQUE NOT NULL,
    user_id INTEGER NOT NULL,
    plan TEXT NOT NULL,
    period TEXT,
    amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'CNY',
    status TEXT NOT NULL DEFAULT 'pending',
    provider TEXT,
    provider_trade TEXT,
    created_at INTEGER NOT NULL,
    paid_at INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    method TEXT,
    target TEXT,
    ip TEXT,
    ua TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS verify_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target TEXT NOT NULL,
    code TEXT NOT NULL,
    purpose TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS devices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    device_id TEXT NOT NULL,
    name TEXT,
    last_seen_at INTEGER,
    created_at INTEGER NOT NULL,
    UNIQUE(user_id, device_id)
  )`,
  `CREATE TABLE IF NOT EXISTS feedback_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    module TEXT,
    type TEXT,
    summary TEXT,
    issue_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER NOT NULL
  )`
];

/* ---------- 基础工具 ---------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function now() { return Math.floor(Date.now() / 1000); }

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      ...extraHeaders
    }
  });
}

async function readBody(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '';
}

function ok(data) { return json({ ok: true, ...data }); }
function fail(error, status = 400, detail) {
  return json(detail === undefined ? { ok: false, error } : { ok: false, error, detail }, status);
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^1[3-9]\d{9}$/;

function validEmail(v) { return typeof v === 'string' && v.length <= 254 && EMAIL_RE.test(v); }
function validPhone(v) { return typeof v === 'string' && PHONE_RE.test(v); }
function validPassword(v) { return typeof v === 'string' && v.length >= 8 && v.length <= 128; }

/* ---------- 编码 ---------- */

function b64url(buf) {
  const u = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/* ---------- 密码哈希（PBKDF2-SHA256） ---------- */

async function hashPassword(pw) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PWD_ITER, hash: 'SHA-256' }, key, 256);
  return b64url(salt) + '$' + b64url(bits);
}

async function verifyPassword(pw, stored) {
  try {
    const [s, h] = String(stored).split('$');
    const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: b64urlDecode(s), iterations: PWD_ITER, hash: 'SHA-256' }, key, 256);
    const h2 = b64url(bits);
    if (h.length !== h2.length) return false;
    let diff = 0;
    for (let i = 0; i < h.length; i++) diff |= h.charCodeAt(i) ^ h2.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

/* ---------- JWT（HMAC-SHA256） ---------- */

let fallbackSecret = null;

async function jwtKey(env) {
  if (env.JWT_SECRET) return enc.encode(env.JWT_SECRET);
  if (!fallbackSecret) {
    fallbackSecret = crypto.getRandomValues(new Uint8Array(32));
    console.warn('[auth] JWT_SECRET 未设置，使用临时随机密钥（每次部署后 token 失效）。生产环境请在项目设置中配置 JWT_SECRET。');
  }
  return fallbackSecret;
}

async function signJwt(payload, env) {
  const secret = await jwtKey(env);
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(header + '.' + body));
  return header + '.' + body + '.' + b64url(sig);
}

async function verifyJwt(token, env) {
  try {
    const secret = await jwtKey(env);
    const parts = String(token).split('.');
    if (parts.length !== 3) return null;
    const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const good = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
    if (!good) return null;
    const payload = JSON.parse(dec.decode(b64urlDecode(parts[1])));
    if (!payload || !payload.exp || payload.exp < now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------- D1 ---------- */

let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new Error('D1 binding "DB" is not configured');
  for (const sql of SCHEMA) await env.DB.prepare(sql).run();
  // 迁移：旧表补齐新列（IF NOT EXISTS 不会更新已存在的表）
  try {
    await env.DB.prepare('ALTER TABLE orders ADD COLUMN period TEXT').run();
  } catch (e) { /* 列已存在则忽略 */ }
  try {
    await env.DB.prepare('ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0').run();
  } catch (e) { /* 列已存在则忽略 */ }
  schemaReady = true;
}

/* ---------- 验证码 ---------- */

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/* ---------- 阿里云短信认证（SendSmsVerifyCode，RPC 签名） ---------- */

// 阿里云 RPC 百分号编码（RFC3986：保留 A-Z a-z 0-9 - _ . ~，其余 UTF-8 字节 %XX）
function aliyunPercentEncode(s) {
  return encodeURIComponent(s)
    .replace(/!/g, '%21')
    .replace(/'/g, '%27')
    .replace(/\(/g, '%28')
    .replace(/\)/g, '%29')
    .replace(/\*/g, '%2A');
}

// HMAC-SHA1 签名：Signature = Base64(HMAC-SHA1(secret + "&", stringToSign))
async function aliyunHmacSha1(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret + '&'),
    { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

// 短信认证模板映射（赠送模板；允许按场景覆盖）
// 优先级：场景专用 env（ALIYUN_SMS_TEMPLATE_RESET/BIND）> 通用 env（ALIYUN_SMS_TEMPLATE，仅注册/登录）> 内置映射
function smsTemplateFor(env, purpose) {
  const map = { register: '100001', login: '100001', reset: '100003', bind: '100004' };
  const specific = env['ALIYUN_SMS_TEMPLATE_' + purpose.toUpperCase()];
  if (specific) return specific;
  if (purpose === 'register' || purpose === 'login') return env.ALIYUN_SMS_TEMPLATE || map[purpose] || '100001';
  return map[purpose] || env.ALIYUN_SMS_TEMPLATE || '100001';
}

// 发送短信验证码（阿里云号码认证服务 dypnsapi.aliyuncs.com，Action=SendSmsVerifyCode）
async function sendSmsAliyun(env, phone, code, purpose) {
  if (!env.ALIYUN_AK_ID || !env.ALIYUN_AK_SECRET) return null;
  const params = {
    AccessKeyId: env.ALIYUN_AK_ID,
    Action: 'SendSmsVerifyCode',
    Format: 'JSON',
    SignatureMethod: 'HMAC-SHA1',
    SignatureNonce: crypto.randomUUID(),
    SignatureVersion: '1.0',
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    Version: '2017-05-25',
    PhoneNumber: phone,
    SignName: env.ALIYUN_SMS_SIGN || '恒创联众',
    TemplateCode: smsTemplateFor(env, purpose),
    TemplateParam: JSON.stringify({ code, min: String(Math.round(CODE_TTL / 60)) }),
    ValidTime: String(CODE_TTL),
    Interval: '60',
    DuplicatePolicy: '1'
  };
  const canonical = Object.keys(params).sort()
    .map(k => aliyunPercentEncode(k) + '=' + aliyunPercentEncode(String(params[k])))
    .join('&');
  const stringToSign = 'POST&%2F&' + aliyunPercentEncode(canonical);
  const signature = aliyunPercentEncode(await aliyunHmacSha1(env.ALIYUN_AK_SECRET, stringToSign));
  const res = await fetch('https://dypnsapi.aliyuncs.com/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: canonical + '&Signature=' + signature
  });
  const data = await res.json().catch(() => null);
  if (data && data.Code === 'OK' && data.Success !== false) return { delivered: true };
  // 返回错误码（如 FREQUENCY_FAIL / MOBILE_NUMBER_ILLEGAL），失败时附 Message 供排障
  return { delivered: false, error: (data && data.Code) || 'http_' + res.status, detail: data && data.Message };
}

async function sendCode(env, target, purpose) {
  // 发送频控：每目标每小时最多 CODE_MAX_SEND 次
  const hourAgo = now() - 3600;
  const cnt = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM verify_codes WHERE target = ? AND created_at > ?'
  ).bind(target, hourAgo).first();
  if (cnt && cnt.n >= CODE_MAX_SEND) return { limited: true };

  const code = genCode();
  await env.DB.prepare(
    'INSERT INTO verify_codes (target, code, purpose, expires_at, used, created_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).bind(target, code, purpose, now() + CODE_TTL, now()).run();

  // 投递：优先邮件（RESEND_API_KEY），其次短信（阿里云短信认证 SendSmsVerifyCode，回退 SMS_WEBHOOK_URL）；均未配置则仅记录日志
  if (env.RESEND_API_KEY && validEmail(target)) {
    const subject = purpose === 'register'
      ? '1号员工 注册验证码'
      : (purpose === 'reset' ? '1号员工 密码重置验证码' : '1号员工 登录验证码');
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.MAIL_FROM || '1号员工 <noreply@spec-ai.cn>',
          to: [target],
          subject,
          text: `您的验证码是 ${code}，10 分钟内有效。`
        })
      });
      return { delivered: true };
    } catch (e) {
      console.error('[auth] 邮件发送失败', String(e));
    }
  }
  if (validPhone(target)) {
    // 阿里云"短信认证"通道（ALIYUN_AK_ID + ALIYUN_AK_SECRET 已配置时优先）
    if (env.ALIYUN_AK_ID && env.ALIYUN_AK_SECRET) {
      try {
        const r = await sendSmsAliyun(env, target, code, purpose);
        if (r && r.delivered) return { delivered: true };
        console.error('[auth] 阿里云短信发送失败', r && r.error);
      } catch (e) {
        console.error('[auth] 阿里云短信发送异常', String(e));
      }
    }
    // 旧版 Webhook 通道（兼容已有配置）
    if (env.SMS_WEBHOOK_URL) {
      try {
        await fetch(env.SMS_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: target, code, purpose })
        });
        return { delivered: true };
      } catch (e) {
        console.error('[auth] 短信发送失败', String(e));
      }
    }
  }
  console.warn(`[auth] 验证码未投递（未配置邮件/短信通道）target=${target} code=${code}`);
  return { delivered: false, devCode: env.DEV_MODE === '1' ? code : undefined };
}

async function consumeCode(env, target, code, purpose) {
  const row = await env.DB.prepare(
    'SELECT id, code, expires_at, used FROM verify_codes WHERE target = ? AND purpose = ? ORDER BY id DESC LIMIT 1'
  ).bind(target, purpose).first();
  if (!row) return 'code_invalid';
  if (row.used) return 'code_used';
  if (row.expires_at < now()) return 'code_expired';
  if (String(row.code) !== String(code)) return 'code_invalid';
  await env.DB.prepare('UPDATE verify_codes SET used = 1 WHERE id = ?').bind(row.id).run();
  return 'ok';
}

/* ---------- 登录限流 ---------- */

async function loginBlocked(env, ip, target) {
  const since = now() - LOGIN_FAIL_WINDOW;
  const r = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM login_logs WHERE success = 0 AND created_at > ? AND (ip = ? OR (target IS NOT NULL AND target = ?))'
  ).bind(since, ip, target).first();
  return r && r.n >= LOGIN_FAIL_LIMIT;
}

const REGISTER_IP_LIMIT = 10;   // 每 IP 每小时注册上限

async function registerLimited(env, ip) {
  const since = now() - 3600;
  const r = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM login_logs WHERE method = ? AND ip = ? AND created_at > ?'
  ).bind('register', ip, since).first();
  return r && r.n >= REGISTER_IP_LIMIT;
}

async function recordLogin(env, userId, method, target, ip, ua, success) {
  await env.DB.prepare(
    'INSERT INTO login_logs (user_id, method, target, ip, ua, success, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, method, target, ip, ua, success ? 1 : 0, now()).run();
}

/* ---------- 鉴权中间件 ---------- */

async function requireUser(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  if (!m) return null;
  const payload = await verifyJwt(m[1], env);
  if (!payload) return null;
  const user = await env.DB.prepare(
    'SELECT id, email, phone, status, plan, plan_expires_at, token_version, pass_hash, created_at FROM users WHERE id = ?'
  ).bind(payload.sub).first();
  if (!user) return null;
  // token 版本校验：改密/重置/注销后旧 token 一律失效
  if (payload.tv !== (user.token_version || 0)) return null;
  return user;
}

/* ---------- 接口路由 ---------- */

async function handleApi(request, env, ctx, path) {
  // CORS 预检：204 属 null-body 状态码，不能带 body（此前误用 json() 导致 500，见 BUG-001）
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400',
      }
    });
  }

  const method = request.method;
  const ip = clientIp(request);
  const ua = request.headers.get('User-Agent') || '';

  // 健康检查
  if (path === '/api/health' || path === '/api/health/') {
    return handleHealth(env);
  }

  // 认证接口
  if (path === '/api/auth/send-code' && method === 'POST') {
    return handleSendCode(request, env);
  }
  if (path === '/api/auth/register' && method === 'POST') {
    return handleRegister(request, env, ip, ua);
  }
  if (path === '/api/auth/login' && method === 'POST') {
    return handleLogin(request, env, ip, ua);
  }
  if (path === '/api/auth/reset-password' && method === 'POST') {
    return handleResetPassword(request, env);
  }
  if (path === '/api/auth/change-password' && method === 'POST') {
    return handleChangePassword(request, env);
  }
  if (path === '/api/auth/revoke-all' && method === 'POST') {
    return handleRevokeAll(request, env);
  }
  if (path === '/api/auth/deactivate' && method === 'POST') {
    return handleDeactivate(request, env);
  }
  if (path === '/api/auth/bind' && method === 'POST') {
    return handleBind(request, env);
  }

  // 账户信息（需登录）
  if (path === '/api/me' && method === 'GET') {
    const user = await requireUser(request, env);
    if (!user) return fail('unauthorized', 401);
    return ok({ user: publicUser(user) });
  }

  // 使用统计（需登录）
  if (path === '/api/stats' && method === 'GET') {
    return handleStats(request, env);
  }

  // 计划列表（公开）
  if (path === '/api/plans' && method === 'GET') {
    return handlePlans();
  }

  // 订阅与订单（需登录）
  if (path === '/api/subscription' && method === 'GET') {
    return handleSubscription(request, env);
  }
  if (path === '/api/subscription/orders' && method === 'POST') {
    return handleCreateOrder(request, env);
  }
  if (path === '/api/subscription/orders' && method === 'GET') {
    return handleListOrders(request, env);
  }
  if (path === '/api/subscription/activate' && method === 'POST') {
    return handleActivateOrder(request, env);
  }

  // 支付回调（预留：微信/支付宝接入后启用）
  if (path === '/api/payment/notify' && method === 'POST') {
    return fail('payment_not_configured', 501);
  }

  // 许可与设备（App 端校验订阅权益，需登录）
  if (path === '/api/license/check' && method === 'POST') {
    return handleLicenseCheck(request, env);
  }
  if (path === '/api/license/register-device' && method === 'POST') {
    return handleRegisterDevice(request, env);
  }
  if (path === '/api/license/remove-device' && method === 'POST') {
    return handleRemoveDevice(request, env);
  }

  // 用户反馈（需登录；云端自动建 GitHub issue）
  if (path === '/api/feedback' && method === 'POST') {
    return handleFeedback(request, env);
  }

  return fail('not_found', 404);
}

function publicUser(u) {
  return {
    id: u.id,
    email: u.email || null,
    phone: u.phone || null,
    plan: safePlan(u.plan || 'Free'),
    planExpiresAt: u.plan_expires_at || null,
    hasPassword: !!u.pass_hash,
    createdAt: u.created_at
  };
}

async function handleStats(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const r = await env.DB.prepare(
    'SELECT COUNT(*) AS n, MAX(created_at) AS last FROM login_logs WHERE user_id = ? AND success = 1 AND method != ?'
  ).bind(user.id, 'register').first();
  const dev = await env.DB.prepare('SELECT COUNT(*) AS n FROM devices WHERE user_id = ?').bind(user.id).first();
  const methods = await env.DB.prepare(
    'SELECT method, COUNT(*) AS n FROM login_logs WHERE user_id = ? AND success = 1 AND method != ? GROUP BY method ORDER BY n DESC'
  ).bind(user.id, 'register').all();
  const recent = await env.DB.prepare(
    'SELECT method, ip, ua, created_at FROM login_logs WHERE user_id = ? AND method != ? ORDER BY id DESC LIMIT 10'
  ).bind(user.id, 'register').all();
  return ok({
    stats: {
      totalLogins: r ? (r.n || 0) : 0,
      lastLoginAt: r ? r.last : null,
      uniqueDevices: dev ? (dev.n || 0) : 0,
      methods: (methods.results || []).map(function (m) { return { method: m.method, count: m.n }; })
    },
    recentLogins: (recent.results || []).map(function (x) {
      return { method: x.method, ip: x.ip, ua: x.ua, at: x.created_at };
    })
  });
}

/* ---------- 订阅与订单 ---------- */

function handlePlans() {
  return ok({
    plans: Object.keys(PLANS).map(function (k) { return PLANS[k]; }),
    days: SUBSCRIPTION_DAYS
  });
}

async function currentSubscription(env, userId) {
  const u = await env.DB.prepare('SELECT plan, plan_expires_at FROM users WHERE id = ?').bind(userId).first();
  if (!u) return null;
  const plan = safePlan(u.plan || 'Free');
  const hasPlan = plan !== 'Free';
  const active = hasPlan && u.plan_expires_at && u.plan_expires_at > now();
  return {
    plan: active ? plan : 'Free',
    expiresAt: active ? u.plan_expires_at : null,
    status: active ? 'active' : (hasPlan ? 'expired' : 'none')
  };
}

async function handleSubscription(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const sub = await currentSubscription(env, user.id);
  return ok({ subscription: sub });
}

function genOrderNo() {
  return 'SA' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 8).toUpperCase();
}

async function handleCreateOrder(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const planId = normalizePlan(b.plan);
  const period = b.period === 'yearly' ? 'yearly' : 'monthly';
  const plan = planId ? PLANS[planId] : null;
  if (!plan) return fail('invalid_plan');
  const amount = period === 'yearly' ? plan.yearlyCents : plan.monthlyCents;
  if (amount <= 0) return fail('plan_free', 400); // 免费版无需下单

  const orderNo = genOrderNo();
  const t = now();
  await env.DB.prepare(
    'INSERT INTO orders (order_no, user_id, plan, period, amount_cents, currency, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(orderNo, user.id, planId, period, amount, 'CNY', 'pending', t).run();
  return ok({
    order: {
      orderNo, plan: planId, period, amountCents: amount, currency: 'CNY',
      status: 'pending', createdAt: t
    },
    payment: { provider: null, status: 'pending_integration', message: 'payment_channel_pending' },
    devMode: env.DEV_MODE === '1'
  });
}

async function handleListOrders(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const rows = await env.DB.prepare(
    'SELECT order_no, plan, amount_cents, currency, status, provider, created_at, paid_at FROM orders WHERE user_id = ? ORDER BY id DESC LIMIT 20'
  ).bind(user.id).all();
  return ok({
    orders: (rows.results || []).map(function (o) {
      return {
        orderNo: o.order_no, plan: o.plan, amountCents: o.amount_cents, currency: o.currency,
        status: o.status, provider: o.provider, createdAt: o.created_at, paidAt: o.paid_at
      };
    })
  });
}

async function handleActivateOrder(request, env) {
  // 开发模式专用：模拟支付成功，验证订阅链路（生产环境必须经支付回调）
  if (env.DEV_MODE !== '1') return fail('forbidden', 403);
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const orderNo = String(b.orderNo || '');
  const order = await env.DB.prepare(
    'SELECT id, user_id, plan, period, status, created_at FROM orders WHERE order_no = ?'
  ).bind(orderNo).first();
  if (!order) return fail('order_not_found', 404);
  if (order.user_id !== user.id) return fail('forbidden', 403);
  if (order.status === 'paid') return fail('order_already_paid', 409);

  const t = now();
  // 以订单内持久化的 period 为准，不接受客户端传入
  const days = SUBSCRIPTION_DAYS[order.period === 'yearly' ? 'yearly' : 'monthly'] || 30;
  const cur = await env.DB.prepare('SELECT plan_expires_at FROM users WHERE id = ?').bind(user.id).first();
  const base = (cur && cur.plan_expires_at && cur.plan_expires_at > t) ? cur.plan_expires_at : t;
  const expiresAt = base + days * 86400;

  await env.DB.prepare('UPDATE orders SET status = ?, paid_at = ? WHERE id = ?').bind('paid', t, order.id).run();
  await env.DB.prepare('UPDATE users SET plan = ?, plan_expires_at = ?, updated_at = ? WHERE id = ?')
    .bind(order.plan, expiresAt, t, user.id).run();
  await env.DB.prepare(
    'INSERT INTO subscriptions (user_id, plan, status, started_at, expires_at, provider, provider_order, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(user.id, order.plan, 'active', t, expiresAt, 'dev', orderNo, t).run();

  const sub = await currentSubscription(env, user.id);
  return ok({ subscription: sub, orderNo });
}

/* ---------- 许可与设备 ---------- */

function planFeatures(plan) {
  return FEATURES[safePlan(plan)] || FEATURES.Free;
}

function deviceList(rows) {
  return (rows || []).map(function (d) {
    return { deviceId: d.device_id, name: d.name, lastSeenAt: d.last_seen_at, createdAt: d.created_at };
  });
}

async function handleLicenseCheck(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const sub = await currentSubscription(env, user.id);
  const devices = await env.DB.prepare(
    'SELECT device_id, name, last_seen_at, created_at FROM devices WHERE user_id = ? ORDER BY id ASC'
  ).bind(user.id).all();
  return ok({
    license: {
      plan: sub.plan,
      status: sub.status,
      expiresAt: sub.expiresAt,
      features: planFeatures(sub.plan)
    },
    devices: deviceList(devices.results)
  });
}

async function handleRegisterDevice(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const deviceId = String(b.deviceId || '').trim();
  const name = String(b.name || '').slice(0, 64);
  if (!deviceId || deviceId.length > 128) return fail('invalid_device');
  const sub = await currentSubscription(env, user.id);
  const maxDevices = planFeatures(sub.plan).maxDevices;
  const devices = await env.DB.prepare('SELECT device_id FROM devices WHERE user_id = ?').bind(user.id).all();
  const exists = devices.results.some(function (d) { return d.device_id === deviceId; });
  if (!exists && devices.results.length >= maxDevices) return fail('device_limit', 403, { max: maxDevices });
  const t = now();
  if (exists) {
    await env.DB.prepare('UPDATE devices SET name = ?, last_seen_at = ? WHERE user_id = ? AND device_id = ?')
      .bind(name, t, user.id, deviceId).run();
  } else {
    try {
      await env.DB.prepare('INSERT INTO devices (user_id, device_id, name, last_seen_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(user.id, deviceId, name, t, t).run();
    } catch (e) {
      // 并发注册同一设备 → 唯一约束冲突，按已存在处理（更新时间戳）
      if (/UNIQUE/i.test(String(e.message || e))) {
        await env.DB.prepare('UPDATE devices SET name = ?, last_seen_at = ? WHERE user_id = ? AND device_id = ?')
          .bind(name, t, user.id, deviceId).run();
      } else {
        throw e;
      }
    }
  }
  const list = await env.DB.prepare(
    'SELECT device_id, name, last_seen_at, created_at FROM devices WHERE user_id = ? ORDER BY id ASC'
  ).bind(user.id).all();
  return ok({ allowed: true, max: maxDevices, devices: deviceList(list.results) });
}

async function handleRemoveDevice(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const deviceId = String(b.deviceId || '');
  if (!deviceId || deviceId.length > 128) return fail('invalid_device');
  await env.DB.prepare('DELETE FROM devices WHERE user_id = ? AND device_id = ?').bind(user.id, deviceId).run();
  return ok({ removed: deviceId });
}

/* ---------- 用户反馈（云端自动建 GitHub issue） ---------- */

const FEEDBACK_WINDOW = 60;               // 同用户 1 分钟最多 1 条
const FEEDBACK_TITLE_MAX = 60;            // GitHub issue 标题 ≤ 60 字符
const FEEDBACK_GH_REPO = 'lswdneil/Digital-AI-Employee';
const FEEDBACK_TYPE_RE = /^[A-Za-z0-9_-]{1,40}$/;   // 类型用于 GitHub label，限安全字符
const FEEDBACK_FIELD_MAX = { module: 40, type: 40, summary: 300, description: 4000, version: 40, userCode: 80 };

async function handleFeedback(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);

  const b = await readBody(request);
  // 来源员工：'employee-1' | 'employee-2'；缺省 employee-2（兼容早期 E2 客户端不带 source）
  const source = b.source === 'employee-1' ? 'employee-1' : 'employee-2';
  const prefix = source === 'employee-1' ? 'E1' : 'E2';
  const module = String(b.module || '').trim();
  const type = String(b.type || '').trim();
  const summary = String(b.summary || '').trim();
  const description = String(b.description || '').trim();
  const version = String(b.version || '').trim();
  const userCode = String(b.userCode || '').trim();

  if (!module || !type || !summary || !description || !version) {
    return fail('missing_fields', 400, { required: ['module', 'type', 'summary', 'description', 'version'] });
  }
  if (!FEEDBACK_TYPE_RE.test(type)) return fail('invalid_type', 400, { type });
  const tooLongField = Object.keys(FEEDBACK_FIELD_MAX).find(function (k) {
    return String(b[k] || '').length > FEEDBACK_FIELD_MAX[k];
  });
  if (tooLongField) return fail('field_too_long', 400, { field: tooLongField });

  const ghToken = env.WORKERS_GH_TOKEN;
  if (!ghToken) return fail('github_not_configured', 503, 'WORKERS_GH_TOKEN 未配置（wrangler secret put WORKERS_GH_TOKEN）');

  // 限流：同用户 1 分钟 1 条（D1 feedback_logs 计数）
  const since = now() - FEEDBACK_WINDOW;
  const recent = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM feedback_logs WHERE user_id = ? AND created_at > ?'
  ).bind(user.id, since).first();
  if (recent && recent.n >= 1) {
    return fail('feedback_rate_limited', 429, { retryAfter: FEEDBACK_WINDOW });
  }

  const t = now();
  await env.DB.prepare(
    'INSERT INTO feedback_logs (user_id, module, type, summary, issue_url, status, created_at) VALUES (?, ?, ?, ?, NULL, ?, ?)'
  ).bind(user.id, module, type, summary, 'pending', t).run();

  const title = Array.from('[' + prefix + '] [' + module + '] ' + summary).slice(0, FEEDBACK_TITLE_MAX).join('');
  const submitter = user.email || user.phone || '（未绑定）';
  const bodyParts = [
    '### 问题描述', description, '',
    '### 问题模块', module, '',
    '### 问题类型', type, '',
    '### 环境信息', '- 版本: v' + version, '- 提交时间: ' + new Date(t * 1000).toISOString(), '',
    '### 提交方信息', '- 员工编号: ' + prefix, '- 提交用户: ' + submitter
  ];
  if (userCode) bodyParts.push('- 内测代号: ' + userCode);
  const body = bodyParts.join('\n');

  let gh;
  try {
    const ghRes = await fetch('https://api.github.com/repos/' + FEEDBACK_GH_REPO + '/issues', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + ghToken,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'spec-ai-worker-feedback',
        'X-GitHub-Api-Version': '2022-11-28'
      },
      body: JSON.stringify({
        title: title,
        body: body,
        labels: ['source:' + source, 'type:' + type]
      })
    });
    if (!ghRes.ok) {
      let reason = 'GitHub API HTTP ' + ghRes.status;
      try {
        const j = await ghRes.json();
        if (j && j.message) reason += ': ' + j.message;
      } catch (e) { /* 保留状态码原因 */ }
      await env.DB.prepare("UPDATE feedback_logs SET status = 'failed' WHERE user_id = ? AND created_at = ?").bind(user.id, t).run();
      return fail('github_issue_failed', 502, reason);
    }
    gh = await ghRes.json();
  } catch (e) {
    await env.DB.prepare("UPDATE feedback_logs SET status = 'failed' WHERE user_id = ? AND created_at = ?").bind(user.id, t).run();
    return fail('github_unreachable', 502, String(e.message || e));
  }

  const issueUrl = (gh && gh.html_url) || ('https://github.com/' + FEEDBACK_GH_REPO + '/issues/' + ((gh && gh.number) || ''));
  await env.DB.prepare("UPDATE feedback_logs SET status = 'ok', issue_url = ? WHERE user_id = ? AND created_at = ?").bind(issueUrl, user.id, t).run();
  return ok({ issueUrl: issueUrl });
}

/* ---------- 各接口实现 ---------- */

async function handleHealth(env) {
  try {
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    return ok({ service: 'spec-ai-api', version: VERSION, db: 'ok', users: r ? r.n : 0, time: now() });
  } catch (e) {
    return fail('db_unavailable', 503, String(e.message || e));
  }
}

async function handleSendCode(request, env) {
  const b = await readBody(request);
  const target = String(b.target || '').trim().toLowerCase();
  const purpose = (b.purpose === 'login' || b.purpose === 'reset' || b.purpose === 'bind') ? b.purpose : 'register';
  if (!validEmail(target) && !validPhone(target)) return fail('invalid_target');
  const r = await sendCode(env, target, purpose);
  if (r.limited) return fail('too_many_requests', 429);
  const resp = { delivered: !!r.delivered };
  if (env.DEV_MODE === '1' && r.devCode) resp.devCode = r.devCode;
  return ok(resp);
}

async function handleResetPassword(request, env) {
  const b = await readBody(request);
  const email = String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '');
  const newPassword = b.newPassword || '';
  if (!validEmail(email)) return fail('invalid_email');
  if (!validPassword(newPassword)) return fail('invalid_password');
  if (!code) return fail('code_required');
  const user = await env.DB.prepare('SELECT id, pass_hash FROM users WHERE email = ?').bind(email).first();
  if (!user) return fail('account_not_found', 404);
  const ver = await consumeCode(env, email, code, 'reset');
  if (ver !== 'ok') return fail(ver);
  const passHash = await hashPassword(newPassword);
  // 重置密码同时撤销所有旧 token
  await env.DB.prepare('UPDATE users SET pass_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .bind(passHash, now(), user.id).run();
  return ok({ message: 'password_reset' });
}

async function handleChangePassword(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const oldPw = b.oldPassword || '';
  const newPw = b.newPassword || '';
  if (!validPassword(newPw)) return fail('invalid_password');
  if (!user.pass_hash) return fail('invalid_method'); // 手机账号无密码
  const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(user.id).first();
  if (!(await verifyPassword(oldPw, row.pass_hash))) return fail('bad_credentials', 401);
  const passHash = await hashPassword(newPw);
  await env.DB.prepare('UPDATE users SET pass_hash = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .bind(passHash, now(), user.id).run();
  return ok({ message: 'password_changed' });
}

async function handleRevokeAll(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  await env.DB.prepare('UPDATE users SET token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .bind(now(), user.id).run();
  return ok({ message: 'sessions_revoked' });
}

async function handleDeactivate(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const row = await env.DB.prepare('SELECT pass_hash FROM users WHERE id = ?').bind(user.id).first();
  if (row.pass_hash) {
    if (!(await verifyPassword(String(b.password || ''), row.pass_hash))) return fail('bad_credentials', 401);
  } else {
    const code = String(b.code || '');
    if (!code) return fail('code_required');
    const ver = await consumeCode(env, user.phone, code, 'login');
    if (ver !== 'ok') return fail(ver);
  }
  await env.DB.prepare('UPDATE users SET status = ?, token_version = token_version + 1, updated_at = ? WHERE id = ?')
    .bind('disabled', now(), user.id).run();
  return ok({ message: 'account_deactivated' });
}

async function handleBind(request, env) {
  const user = await requireUser(request, env);
  if (!user) return fail('unauthorized', 401);
  const b = await readBody(request);
  const method = b.method === 'phone' ? 'phone' : 'email';
  const target = method === 'phone' ? String(b.phone || '').trim() : String(b.email || '').trim().toLowerCase();
  const code = String(b.code || '');
  if (method === 'email' && !validEmail(target)) return fail('invalid_email');
  if (method === 'phone' && !validPhone(target)) return fail('invalid_phone');
  if (!code) return fail('code_required');
  const ver = await consumeCode(env, target, code, 'bind');
  if (ver !== 'ok') return fail(ver);
  const exist = await env.DB.prepare(
    method === 'email' ? 'SELECT id FROM users WHERE email = ?' : 'SELECT id FROM users WHERE phone = ?'
  ).bind(target).first();
  if (exist && exist.id !== user.id) return fail('already_registered', 409);
  const t = now();
  if (method === 'email') {
    await env.DB.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').bind(target, t, user.id).run();
  } else {
    await env.DB.prepare('UPDATE users SET phone = ?, updated_at = ? WHERE id = ?').bind(target, t, user.id).run();
  }
  const fresh = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(user.id).first();
  return ok({ user: publicUser(fresh) });
}

async function handleRegister(request, env, ip, ua) {
  const b = await readBody(request);
  const method = b.method === 'phone' ? 'phone' : 'email';
  const email = method === 'email' ? String(b.email || '').trim().toLowerCase() : null;
  const phone = method === 'phone' ? String(b.phone || '').trim() : null;
  const password = b.password || '';
  const code = String(b.code || '');

  if (method === 'email' && !validEmail(email)) return fail('invalid_email');
  if (method === 'phone' && !validPhone(phone)) return fail('invalid_phone');
  if (method === 'email' && !validPassword(password)) return fail('invalid_password');
  if (!code) return fail('code_required');

  const target = method === 'email' ? email : phone;
  const ver = await consumeCode(env, target, code, 'register');
  if (ver !== 'ok') return fail(ver);

  if (await registerLimited(env, ip)) return fail('too_many_requests', 429);

  // 查重
  const exist = await env.DB.prepare(
    method === 'email'
      ? 'SELECT id FROM users WHERE email = ?'
      : 'SELECT id FROM users WHERE phone = ?'
  ).bind(target).first();
  if (exist) return fail('already_registered', 409);

  const passHash = method === 'email' ? await hashPassword(password) : null;
  const t = now();
  let ins;
  try {
    ins = await env.DB.prepare(
      'INSERT INTO users (email, phone, pass_hash, status, plan, token_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)'
    ).bind(method === 'email' ? target : null, method === 'phone' ? target : null, passHash, 'active', 'Free', t, t).run();
  } catch (e) {
    // 并发注册触发唯一约束 → 归一到 409
    if (/UNIQUE/i.test(String(e.message || e))) return fail('already_registered', 409);
    throw e;
  }

  const userId = ins.meta.last_row_id;
  const user = await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
  await recordLogin(env, userId, 'register', target, ip, ua, true);
  const token = await signJwt({ sub: userId, plan: 'Free', tv: 0, iat: now(), exp: now() + JWT_TTL }, env);
  return ok({ token, user: publicUser(user) });
}

async function handleLogin(request, env, ip, ua) {
  const b = await readBody(request);
  const method = b.method === 'phone' ? 'phone' : 'email';
  const email = method === 'email' ? String(b.email || '').trim().toLowerCase() : null;
  const phone = method === 'phone' ? String(b.phone || '').trim() : null;
  const password = b.password || '';
  const code = String(b.code || '');

  if (method === 'email') {
    if (!validEmail(email)) return fail('invalid_email');
    if (!validPassword(password)) return fail('invalid_password');
  } else {
    if (!validPhone(phone)) return fail('invalid_phone');
    if (!code) return fail('code_required');
  }

  const target = method === 'email' ? email : phone;
  if (await loginBlocked(env, ip, target)) return fail('too_many_attempts', 429);

  let user = await env.DB.prepare(
    method === 'email' ? 'SELECT * FROM users WHERE email = ?' : 'SELECT * FROM users WHERE phone = ?'
  ).bind(target).first();

  if (method === 'phone') {
    const ver = await consumeCode(env, target, code, 'login');
    if (ver !== 'ok') {
      await recordLogin(env, user ? user.id : null, method, target, ip, ua, false);
      return fail(ver);
    }
  } else if (!user || !user.pass_hash || !(await verifyPassword(password, user.pass_hash))) {
    await recordLogin(env, user ? user.id : null, method, target, ip, ua, false);
    return fail('bad_credentials', 401);
  }

  if (!user) return fail('account_not_registered', 404);
  if (user.status !== 'active') return fail('account_disabled', 403);
  await recordLogin(env, user.id, method, target, ip, ua, true);
  const token = await signJwt({ sub: user.id, plan: safePlan(user.plan), tv: user.token_version || 0, iat: now(), exp: now() + JWT_TTL }, env);
  return ok({ token, user: publicUser(user) });
}

/* ---------- 入口 ---------- */

export { aliyunPercentEncode, smsTemplateFor, sendSmsAliyun, sendCode };

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        // 统一建表入口（幂等，schemaReady 缓存；消除各 handler 漏调 ensureSchema 导致空库 500 的整类问题）
        await ensureSchema(env);
        return await handleApi(request, env, ctx, path);
      }
      return env.ASSETS.fetch(request);
    } catch (e) {
      return fail('internal', 500, String(e.message || e));
    }
  }
};
