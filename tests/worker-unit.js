/**
 * _worker.js 后端逻辑单元测试（本地真实 SQLite，模拟 D1 接口）
 *
 * 运行：node tests/worker-unit.js
 * 覆盖：健康检查 / 邮箱注册 / 邮箱登录 / 错误密码 / 鉴权 / 手机验证码注册登录
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, '_worker.js');

/* ---------- 复制为 .mjs 以便 ESM 导入 ---------- */
const tmpFile = path.join(os.tmpdir(), `_worker-test-${process.pid}.mjs`);
fs.copyFileSync(SRC, tmpFile);

/* ---------- D1 兼容包装 ---------- */
function makeDb() {
  const db = new DatabaseSync(':memory:');
  const wrap = {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const exec = (params) => ({
        async run() {
          const r = stmt.run(...params);
          return { meta: { last_row_id: Number(r.lastInsertRowid) } };
        },
        async first() {
          const row = stmt.get(...params);
          return row === undefined ? null : row;
        },
        async all() {
          return { results: stmt.all(...params) };
        }
      });
      const base = exec([]);
      base.bind = (...params) => exec(params);
      return base;
    }
  };
  return wrap;
}

/* ---------- 断言 ---------- */
let passed = 0, failed = 0;
function assert(name, cond, extra) {
  if (cond) { passed++; console.log('  ✅ ' + name); }
  else { failed++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
}

async function main() {
  const mod = await import('file://' + tmpFile.replace(/\\/g, '/'));
  const worker = mod.default;
  const env = { DB: makeDb(), ASSETS: { fetch: async (req) => new Response('static:' + new URL(req.url).pathname) }, JWT_SECRET: 'unit-test-secret', DEV_MODE: '1' };

  async function call(path, body, headers = {}) {
    const res = await worker.fetch(new Request('https://spec-ai.cn' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body ? JSON.stringify(body) : undefined
    }), env, {});
    let data = null;
    try { data = await res.json(); } catch { /* ignore */ }
    return { status: res.status, data };
  }

  console.log('— 健康检查');
  let r = await call('/api/health');
  assert('health ok', r.status === 200 && r.data.ok && r.data.db === 'ok', JSON.stringify(r.data));
  assert('health users=0', r.data.users === 0);

  console.log('— 邮箱注册');
  r = await call('/api/auth/send-code', { target: 'user@example.com', purpose: 'register' });
  assert('send-code ok', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  const code = r.data.devCode;
  assert('dev code 返回（DEV_MODE）', typeof code === 'string' && code.length === 6, String(code));

  r = await call('/api/auth/register', { method: 'email', email: 'user@example.com', password: 'password123', code });
  assert('register 成功', r.status === 200 && r.data.ok && r.data.token, JSON.stringify(r.data));
  assert('register 返回 email', r.data.user && r.data.user.email === 'user@example.com');
  const token = r.data.token;

  r = await call('/api/auth/send-code', { target: 'user@example.com', purpose: 'register' });
  const code2 = r.data.devCode;
  r = await call('/api/auth/register', { method: 'email', email: 'user@example.com', password: 'password123', code: code2 });
  assert('重复注册 409', r.status === 409 && r.data.error === 'already_registered', JSON.stringify(r.data));

  console.log('— 邮箱登录');
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'password123' });
  assert('登录成功', r.status === 200 && r.data.ok && r.data.token, JSON.stringify(r.data));

  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'wrongpass1' });
  assert('错误密码 401', r.status === 401 && r.data.error === 'bad_credentials', JSON.stringify(r.data));

  console.log('— 鉴权');
  r = await call('/api/me', null, { Authorization: 'Bearer ' + token });
  assert('带 token 取 me', r.status === 200 && r.data.user && r.data.user.plan === 'free', JSON.stringify(r.data));
  r = await call('/api/me');
  assert('无 token 401', r.status === 401, JSON.stringify(r.data));
  r = await call('/api/me', null, { Authorization: 'Bearer invalid.token.here' });
  assert('伪造 token 401', r.status === 401, JSON.stringify(r.data));

  console.log('— 手机验证码注册/登录');
  r = await call('/api/auth/send-code', { target: '13800138000', purpose: 'register' });
  const phoneCode = r.data.devCode;
  assert('手机发码', typeof phoneCode === 'string', String(r.data));
  r = await call('/api/auth/register', { method: 'phone', phone: '13800138000', code: phoneCode });
  assert('手机注册成功', r.status === 200 && r.data.ok && r.data.user.phone === '13800138000', JSON.stringify(r.data));
  r = await call('/api/auth/send-code', { target: '13800138000', purpose: 'login' });
  const loginCode = r.data.devCode;
  r = await call('/api/auth/login', { method: 'phone', phone: '13800138000', code: loginCode });
  assert('手机登录成功', r.status === 200 && r.data.ok && r.data.token, JSON.stringify(r.data));

  console.log('— 验证码一次性');
  r = await call('/api/auth/login', { method: 'phone', phone: '13800138000', code: loginCode });
  assert('验证码复用被拒', r.status !== 200, JSON.stringify(r.data));

  console.log('— 静态回退');
  const sres = await worker.fetch(new Request('https://spec-ai.cn/index.html'), env, {});
  const sbody = await sres.text();
  assert('静态资源回退', sbody === 'static:/index.html', sbody);

  fs.unlinkSync(tmpFile);
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
