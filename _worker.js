/**
 * 1号员工 官网后端（Cloudflare Pages advanced mode worker）
 *
 * - /api/*     业务接口（注册/登录/统计/订阅/许可，分阶段实现）
 * - 其余路径    回退到静态资源（env.ASSETS），现有页面完全不受影响
 * - 依赖        D1 数据库绑定（变量名 DB）+ Web Crypto（零外部依赖）
 *
 * 安全约定：密码 PBKDF2-SHA256 哈希、JWT(HMAC-SHA256) 鉴权、
 * 登录限流、验证码一次性使用。均在后续阶段实现。
 */

const VERSION = '0.1.0';
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    pass_hash TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    plan TEXT NOT NULL DEFAULT 'free',
    plan_expires_at INTEGER,
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
  )`
];

/* ---------- 基础工具 ---------- */

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

function now() {
  return Math.floor(Date.now() / 1000);
}

/* ---------- D1 建表（幂等，IF NOT EXISTS） ---------- */

let schemaReady = false;

async function ensureSchema(env) {
  if (schemaReady) return;
  if (!env.DB) throw new Error('D1 binding "DB" is not configured');
  for (const sql of SCHEMA) {
    await env.DB.prepare(sql).run();
  }
  schemaReady = true;
}

/* ---------- 接口路由 ---------- */

async function handleApi(request, env, ctx, path) {
  if (request.method === 'OPTIONS') return json({ ok: true }, 204);

  if (path === '/api/health' || path === '/api/health/') {
    return handleHealth(env);
  }

  // 后续阶段在此挂载：/api/auth/*  /api/me  /api/stats  /api/subscription/*  /api/license
  return json({ ok: false, error: 'not_found' }, 404);
}

async function handleHealth(env) {
  let db = 'ok';
  let error = null;
  try {
    await ensureSchema(env);
    const r = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first();
    db = 'ok';
    return json({
      ok: true,
      service: 'spec-ai-api',
      version: VERSION,
      db,
      users: r ? r.n : 0,
      time: now()
    });
  } catch (e) {
    return json({ ok: false, error: 'db_unavailable', detail: String(e.message || e) }, 503);
  }
}

/* ---------- 入口 ---------- */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    try {
      if (path.startsWith('/api/')) {
        return await handleApi(request, env, ctx, path);
      }
      // 静态资源回退：现有页面/样式/脚本照常服务
      return env.ASSETS.fetch(request);
    } catch (e) {
      return json({ ok: false, error: 'internal', detail: String(e.message || e) }, 500);
    }
  }
};
