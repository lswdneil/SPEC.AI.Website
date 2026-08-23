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

  // 模拟不同用户来自不同出口 IP（避免限流聚合误伤）
  let testIp = '203.0.113.10';

  async function call(path, body, headers = {}) {
    const res = await worker.fetch(new Request('https://spec-ai.cn' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': testIp, ...headers },
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
  let token = r.data.token;

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

  console.log('— 统计');
  r = await call('/api/stats', null, { Authorization: 'Bearer ' + token });
  assert('stats 需登录 200', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  assert('stats 登录次数 >= 1', r.data.stats && r.data.stats.totalLogins >= 1, JSON.stringify(r.data.stats));
  assert('stats 最近登录时间存在', r.data.stats && !!r.data.stats.lastLoginAt, JSON.stringify(r.data.stats));
  assert('stats 最近登录记录非空', Array.isArray(r.data.recentLogins) && r.data.recentLogins.length >= 1, JSON.stringify(r.data.recentLogins));
  r = await call('/api/stats');
  assert('stats 无 token 401', r.status === 401, JSON.stringify(r.data));

  console.log('— 手机验证码注册/登录');
  testIp = '203.0.113.20';
  r = await call('/api/auth/send-code', { target: '13800138000', purpose: 'register' });
  const phoneCode = r.data.devCode;
  assert('手机发码', typeof phoneCode === 'string', String(r.data));
  r = await call('/api/auth/register', { method: 'phone', phone: '13800138000', code: phoneCode });
  assert('手机注册成功', r.status === 200 && r.data.ok && r.data.user.phone === '13800138000', JSON.stringify(r.data));
  r = await call('/api/auth/send-code', { target: '13800138000', purpose: 'login' });
  const loginCode = r.data.devCode;
  r = await call('/api/auth/login', { method: 'phone', phone: '13800138000', code: loginCode });
  assert('手机登录成功', r.status === 200 && r.data.ok && r.data.token, JSON.stringify(r.data));
  const phoneToken = r.data.token;

  console.log('— 验证码一次性');
  r = await call('/api/auth/login', { method: 'phone', phone: '13800138000', code: loginCode });
  assert('验证码复用被拒', r.status !== 200, JSON.stringify(r.data));

  console.log('— 计划与订阅');
  r = await call('/api/plans');
  assert('plans 公开可查', r.status === 200 && r.data.ok && Array.isArray(r.data.plans), JSON.stringify(r.data));
  const pro = (r.data.plans || []).find(function (p) { return p.id === 'pro'; });
  assert('pro 计划价格存在', pro && pro.monthlyCents === 1990, JSON.stringify(pro));

  r = await call('/api/subscription/orders', { plan: 'pro', period: 'monthly' });
  assert('下单需登录 401', r.status === 401, JSON.stringify(r.data));

  r = await call('/api/subscription/orders', { plan: 'pro', period: 'monthly' }, { Authorization: 'Bearer ' + token });
  assert('创建订单成功', r.status === 200 && r.data.ok && r.data.order.orderNo, JSON.stringify(r.data));
  assert('订单金额正确', r.data.order.amountCents === 1990, JSON.stringify(r.data.order));
  assert('devMode 返回', r.data.devMode === true, JSON.stringify(r.data));
  const orderNo = r.data.order.orderNo;

  r = await call('/api/subscription/orders', { plan: 'free', period: 'monthly' }, { Authorization: 'Bearer ' + token });
  assert('免费版下单被拒', r.status === 400 && r.data.error === 'plan_free', JSON.stringify(r.data));

  r = await call('/api/subscription/orders', null, { Authorization: 'Bearer ' + token });
  assert('订单列表包含新订单', r.status === 200 && r.data.ok && r.data.orders.some(function (o) { return o.orderNo === orderNo; }), JSON.stringify(r.data));

  r = await call('/api/subscription', null, { Authorization: 'Bearer ' + token });
  assert('订阅初始为 free', r.status === 200 && r.data.subscription.plan === 'free', JSON.stringify(r.data));

  r = await call('/api/subscription/activate', { orderNo: orderNo }, { Authorization: 'Bearer ' + token });
  assert('激活订单（dev）', r.status === 200 && r.data.ok && r.data.subscription.plan === 'pro', JSON.stringify(r.data));

  r = await call('/api/subscription', null, { Authorization: 'Bearer ' + token });
  assert('订阅升级为 pro', r.status === 200 && r.data.subscription.plan === 'pro' && r.data.subscription.status === 'active', JSON.stringify(r.data));

  r = await call('/api/payment/notify', { orderNo: orderNo });
  assert('支付回调预留 501', r.status === 501 && r.data.error === 'payment_not_configured', JSON.stringify(r.data));

  console.log('— 许可与设备');
  r = await call('/api/license/check', {}, { Authorization: 'Bearer ' + token });
  assert('license 检查（pro）', r.status === 200 && r.data.license.plan === 'pro', JSON.stringify(r.data));
  assert('pro 权益（设备上限 3）', r.data.license.features.maxDevices === 3, JSON.stringify(r.data.license.features));

  r = await call('/api/license/register-device', { deviceId: 'dev-a', name: 'PC' }, { Authorization: 'Bearer ' + token });
  assert('注册设备 1', r.status === 200 && r.data.allowed && r.data.devices.length === 1, JSON.stringify(r.data));
  r = await call('/api/license/register-device', { deviceId: 'dev-b', name: 'Laptop' }, { Authorization: 'Bearer ' + token });
  assert('注册设备 2', r.status === 200 && r.data.devices.length === 2, JSON.stringify(r.data));
  r = await call('/api/license/register-device', { deviceId: 'dev-c', name: 'Mac' }, { Authorization: 'Bearer ' + token });
  assert('注册设备 3', r.status === 200 && r.data.devices.length === 3, JSON.stringify(r.data));
  r = await call('/api/license/register-device', { deviceId: 'dev-d', name: 'Phone' }, { Authorization: 'Bearer ' + token });
  assert('超限被拒（pro 3 台）', r.status === 403 && r.data.error === 'device_limit', JSON.stringify(r.data));
  r = await call('/api/license/register-device', { deviceId: 'dev-a', name: 'PC-2' }, { Authorization: 'Bearer ' + token });
  assert('重复设备更新不计数', r.status === 200 && r.data.devices.length === 3, JSON.stringify(r.data));

  r = await call('/api/license/remove-device', { deviceId: 'dev-a' }, { Authorization: 'Bearer ' + token });
  assert('移除设备', r.status === 200 && r.data.removed === 'dev-a', JSON.stringify(r.data));
  r = await call('/api/license/register-device', { deviceId: 'dev-d', name: 'Phone' }, { Authorization: 'Bearer ' + token });
  assert('移除后可再绑定', r.status === 200 && r.data.devices.length === 3, JSON.stringify(r.data));

  r = await call('/api/license/check', {}, { Authorization: 'Bearer ' + phoneToken });
  assert('free 用户 license', r.status === 200 && r.data.license.plan === 'free', JSON.stringify(r.data));
  assert('free 权益（设备上限 1）', r.data.license.features.maxDevices === 1 && r.data.license.features.hardwareAccess === false, JSON.stringify(r.data.license.features));
  r = await call('/api/license/register-device', { deviceId: 'f1' }, { Authorization: 'Bearer ' + phoneToken });
  assert('free 绑定 1 台', r.status === 200 && r.data.allowed, JSON.stringify(r.data));
  r = await call('/api/license/register-device', { deviceId: 'f2' }, { Authorization: 'Bearer ' + phoneToken });
  assert('free 第 2 台被拒', r.status === 403 && r.data.error === 'device_limit', JSON.stringify(r.data));
  r = await call('/api/license/check', {});
  assert('license 未登录 401', r.status === 401, JSON.stringify(r.data));

  console.log('— 回归修复验证');
  // Bug1: 验证码正确但号码未注册 → 404 account_not_registered（而非 account_disabled）
  testIp = '203.0.113.21';
  r = await call('/api/auth/send-code', { target: '13900139000', purpose: 'login' });
  const unregCode = r.data.devCode;
  assert('未注册号码发码成功', typeof unregCode === 'string', String(r.data));
  r = await call('/api/auth/login', { method: 'phone', phone: '13900139000', code: unregCode });
  assert('未注册手机号登录 404', r.status === 404 && r.data.error === 'account_not_registered', JSON.stringify(r.data));
  testIp = '203.0.113.10';

  // Bug3: period 以订单存储为准（激活时忽略客户端传入 period）
  r = await call('/api/subscription', null, { Authorization: 'Bearer ' + token });
  const beforeExp = r.data.subscription.expiresAt;
  assert('订阅有到期时间', !!beforeExp, JSON.stringify(r.data));
  r = await call('/api/subscription/orders', { plan: 'pro', period: 'yearly' }, { Authorization: 'Bearer ' + token });
  const yearlyOrder = r.data.order.orderNo;
  r = await call('/api/subscription/activate', { orderNo: yearlyOrder, period: 'monthly' }, { Authorization: 'Bearer ' + token });
  const afterExp = r.data.subscription.expiresAt;
  assert('年付订单 +365 天（客户端 period 无效）', afterExp - beforeExp === 365 * 86400, `before=${beforeExp} after=${afterExp}`);

  // Bug4: 密码重置流程
  r = await call('/api/auth/send-code', { target: 'user@example.com', purpose: 'reset' });
  const resetCode = r.data.devCode;
  assert('重置发码成功', typeof resetCode === 'string', String(r.data));
  r = await call('/api/auth/reset-password', { email: 'user@example.com', code: resetCode, newPassword: 'newpassword456' });
  assert('重置密码成功', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'password123' });
  assert('旧密码失效', r.status === 401, JSON.stringify(r.data));
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'newpassword456' });
  assert('新密码登录成功', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  r = await call('/api/auth/reset-password', { email: 'ghost@example.com', code: '000000', newPassword: 'newpassword456' });
  assert('重置不存在账号 404', r.status === 404, JSON.stringify(r.data));

  console.log('— 账户安全（改密/撤销/注销/绑定）');
  // 回归段重置过密码（newpassword456），重新登录获取有效 token
  testIp = '203.0.113.10';
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'newpassword456' });
  assert('安全段前重新登录', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  token = r.data.token;
  // 手机账号无密码
  r = await call('/api/auth/change-password', { oldPassword: 'x', newPassword: 'newpass123' }, { Authorization: 'Bearer ' + phoneToken });
  assert('手机账号改密被拒', r.status === 400 && r.data.error === 'invalid_method', JSON.stringify(r.data));

  // 邮箱用户改密（reset 后密码为 newpassword456）
  r = await call('/api/auth/change-password', { oldPassword: 'wrongpass', newPassword: 'changedpass1' }, { Authorization: 'Bearer ' + token });
  assert('改密旧密码错误 401', r.status === 401, JSON.stringify(r.data));
  r = await call('/api/auth/change-password', { oldPassword: 'newpassword456', newPassword: 'changedpass1' }, { Authorization: 'Bearer ' + token });
  assert('改密成功', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  r = await call('/api/me', null, { Authorization: 'Bearer ' + token });
  assert('改密后旧 token 失效', r.status === 401, JSON.stringify(r.data));
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'changedpass1' });
  assert('新密码重新登录', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  const newToken = r.data.token;

  // 撤销所有会话
  r = await call('/api/auth/revoke-all', {}, { Authorization: 'Bearer ' + newToken });
  assert('撤销所有会话', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  r = await call('/api/me', null, { Authorization: 'Bearer ' + newToken });
  assert('撤销后 token 失效', r.status === 401, JSON.stringify(r.data));

  // 绑定手机（purpose=bind）
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'changedpass1' });
  const tok2 = r.data.token;
  r = await call('/api/auth/send-code', { target: '13700137000', purpose: 'bind' });
  const bindCode = r.data.devCode;
  assert('绑定发码成功', typeof bindCode === 'string', String(r.data));
  r = await call('/api/auth/bind', { method: 'phone', phone: '13700137000', code: bindCode }, { Authorization: 'Bearer ' + tok2 });
  assert('绑定手机成功', r.status === 200 && r.data.ok && r.data.user.phone === '13700137000', JSON.stringify(r.data));
  r = await call('/api/auth/send-code', { target: '13700137000', purpose: 'login' });
  const bindLoginCode = r.data.devCode;
  r = await call('/api/auth/login', { method: 'phone', phone: '13700137000', code: bindLoginCode });
  assert('新绑定手机可登录', r.status === 200 && r.data.ok, JSON.stringify(r.data));

  // 注销（软删除）
  r = await call('/api/auth/deactivate', { password: 'wrongpass' }, { Authorization: 'Bearer ' + tok2 });
  assert('注销需正确密码', r.status === 401, JSON.stringify(r.data));
  r = await call('/api/auth/deactivate', { password: 'changedpass1' }, { Authorization: 'Bearer ' + tok2 });
  assert('注销成功', r.status === 200 && r.data.ok, JSON.stringify(r.data));
  r = await call('/api/auth/login', { method: 'email', email: 'user@example.com', password: 'changedpass1' });
  assert('注销后登录 403', r.status === 403, JSON.stringify(r.data));

  // 统计不含注册标记
  r = await call('/api/stats', null, { Authorization: 'Bearer ' + phoneToken });
  assert('stats 不含 register 方法', r.status === 200 && !(r.data.stats.methods || []).some(function (m) { return m.method === 'register'; }), JSON.stringify(r.data.stats.methods));

  console.log('— 静态回退');
  const sres = await worker.fetch(new Request('https://spec-ai.cn/index.html'), env, {});
  const sbody = await sres.text();
  assert('静态资源回退', sbody === 'static:/index.html', sbody);

  fs.unlinkSync(tmpFile);
  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error('测试异常:', e); process.exit(1); });
