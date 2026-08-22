#!/usr/bin/env node
/* ============================================================
 * 1号员工官网 — 发布前自动化测试
 *
 * 用法：
 *   node tests/run-tests.js          # 本地跑全部测试
 *   node tests/run-tests.js --json   # 输出 JSON 结果（CI 可用）
 *
 * 覆盖：
 *   1. HTML 文件存在 / 标签平衡 / 关键挂载点
 *   2. releases.json 语法与结构完整性
 *   3. 下载链接格式与平台数据门禁
 *   4. 占位符阻断（REPLACE_WITH / yourname / yourdomain / NovaDesk 残留）
 *   5. 内部资源引用完整性（css/js/img/json）
 *   6. main.js 语法检查
 *   7. style.css 括号平衡
 *
 * 零外部依赖（仅 Node 内置模块），本地与 GitHub Actions 通用。
 * 任一测试失败 exit code = 1，阻断发布。
 * ============================================================ */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const JSON_FLAG = process.argv.includes('--json');
// 本地开发模式：跳过占位符阻断（发布前/CI 必须严格，不带此参数）
const ALLOW_PLACEHOLDERS = process.argv.includes('--allow-placeholders');

const results = [];
let failures = 0;

/* ---------- 小工具 ---------- */
function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}
function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function test(name, fn) {
  let errors = [];
  try {
    errors = fn() || [];
  } catch (e) {
    errors = ['[异常] ' + (e && e.message ? e.message : String(e))];
  }
  if (!Array.isArray(errors)) errors = [String(errors)];
  if (errors.length > 0) failures++;
  results.push({ name, ok: errors.length === 0, errors });
}

/* ---------- 1. HTML 结构 ---------- */
const HTML_FILES = ['index.html', 'download.html', 'changelog.html', 'hardware.html', '404.html'];
const VOID_TAGS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);
const REQUIRED_IDS = {
  'index.html': ['hero-cta', 'caps-grid', 'site-nav', 'bg-canvas'],
  'download.html': ['dl-grid', 'file-rows', 'site-nav', 'bg-canvas'],
  'changelog.html': ['changelog-list', 'site-nav', 'bg-canvas'],
  'hardware.html': ['site-nav', 'bg-canvas'],
  '404.html': ['bg-canvas'],
};

test('HTML 文件存在且标签平衡', () => {
  const errs = [];
  for (const f of HTML_FILES) {
    if (!exists(f)) { errs.push(`${f} 不存在`); continue; }
    const html = read(f);
    const stack = [];
    const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[0].startsWith('<!--')) continue;
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      const rest = m[3];
      if (!closing) {
        if (!VOID_TAGS.has(tag) && !/\/\s*$/.test(rest)) stack.push(tag);
      } else {
        const top = stack.pop();
        if (top !== tag) errs.push(`${f}: </${tag}> 与栈顶 <${top || '无'}> 不匹配`);
      }
    }
    if (stack.length) errs.push(`${f}: 未闭合标签 ${stack.join(', ')}`);
  }
  return errs;
});

test('HTML 关键挂载点存在', () => {
  const errs = [];
  for (const f of Object.keys(REQUIRED_IDS)) {
    if (!exists(f)) continue;
    const html = read(f);
    for (const id of REQUIRED_IDS[f]) {
      if (!new RegExp(`id=["']${id}["']`).test(html)) errs.push(`${f}: 缺少 id="${id}"`);
    }
  }
  return errs;
});

/* ---------- 2. releases.json ---------- */
test('releases.json 语法与结构', () => {
  const errs = [];
  if (!exists('data/releases.json')) return ['data/releases.json 不存在'];
  let data;
  try { data = JSON.parse(read('data/releases.json')); }
  catch (e) { return ['releases.json JSON 解析失败: ' + e.message]; }

  if (!data.product || !data.product.name) errs.push('product.name 缺失');
  if (!data.product.repo || !/^https:\/\/github\.com\//.test(data.product.repo)) errs.push('product.repo 缺失或非 GitHub 地址');
  if (!data.product.homepage || !/^https?:\/\//.test(data.product.homepage)) errs.push('product.homepage 缺失或非法');
  if (!data.latest || !/^\d+\.\d+\.\d+$/.test(data.latest.version || '')) errs.push('latest.version 缺失或非 x.y.z 格式');
  if (!Array.isArray(data.capabilities) || data.capabilities.length < 3) errs.push('capabilities 应至少 3 项');
  if (!Array.isArray(data.changelog) || data.changelog.length === 0) errs.push('changelog 不应为空');
  if (!data.platforms || !data.platforms.windows || !data.platforms.macos || !data.platforms.linux) {
    errs.push('platforms 应包含 windows/macos/linux 三项');
  }
  return errs;
});

test('平台数据与下载链接门禁', () => {
  const errs = [];
  const data = JSON.parse(read('data/releases.json'));
  const repo = data.product.repo.replace(/\/$/, '');
  for (const key of ['windows', 'macos', 'linux']) {
    const p = data.platforms[key];
    if (!p) { errs.push(`platforms.${key} 缺失`); continue; }
    if (!p.label || !p.hint) errs.push(`platforms.${key} 缺少 label/hint`);
    if (!p.primary) {
      // 允许"即将推出"（如 macOS/Linux 未发布），但必须有 files 空数组
      if (!Array.isArray(p.files) || p.files.length !== 0) {
        errs.push(`platforms.${key}: primary 为空时 files 应为空数组`);
      }
      continue;
    }
    const u = p.primary.url || '';
    if (!/^https:\/\/github\.com\//.test(u)) errs.push(`platforms.${key}.primary.url 非 GitHub 链接`);
    else if (!u.startsWith(repo + '/')) errs.push(`platforms.${key}.primary.url 与 product.repo 不一致`);
    if (!p.primary.name || !p.primary.size || !p.primary.sha256) errs.push(`platforms.${key}.primary 缺少 name/size/sha256`);
    if (Array.isArray(p.files)) {
      for (const f of p.files) {
        if (!/^https:\/\/github\.com\//.test(f.url || '')) errs.push(`platforms.${key}.files[].url 非 GitHub 链接`);
        if (!f.name || !f.size || !f.sha256) errs.push(`platforms.${key}.files[] 缺少 name/size/sha256`);
      }
    }
  }
  return errs;
});

/* ---------- 3. 占位符阻断（发布门禁核心） ---------- */
test('占位符阻断（不得残留待替换值）', () => {
  if (ALLOW_PLACEHOLDERS) return []; // 开发模式豁免；发布前/CI 必须严格
  const errs = [];
  const targets = ['REPLACE_WITH', 'yourname', 'yourdomain', 'NovaDesk'];
  const scanFiles = [
    'data/releases.json', 'index.html', 'download.html',
    'changelog.html', 'hardware.html', '404.html', 'assets/css/style.css',
    'assets/js/main.js', 'README.md', 'REMINDERS.md', 'vercel.json',
  ];
  for (const f of scanFiles) {
    if (!exists(f)) continue;
    const content = read(f);
    for (const t of targets) {
      if (content.includes(t)) {
        // REMINDERS.md 里记录待办属于正常引用，跳过
        if (f === 'REMINDERS.md') continue;
        errs.push(`${f} 含占位符/残留: "${t}"`);
      }
    }
  }
  return errs;
});

/* ---------- 4. 内部资源完整性 ---------- */
test('HTML 引用的内部资源存在', () => {
  const errs = [];
  const seen = new Set();
  for (const f of HTML_FILES) {
    if (!exists(f)) continue;
    const html = read(f);
    const re = /(?:href|src)=["']([^"'#?]+\.(?:css|js|svg|png|json|webp|ico))["']/g;
    let m;
    while ((m = re.exec(html))) {
      const rel = m[1].replace(/^\.?\//, '');
      if (/^https?:\/\//.test(rel) || /^data:/.test(rel)) continue;
      if (seen.has(rel)) continue;
      seen.add(rel);
      if (!exists(rel)) errs.push(`${f}: 引用资源不存在 "${m[1]}"`);
    }
  }
  return errs;
});

/* ---------- 6. i18n 完整性 ---------- */
test('i18n 四语字典与切换器', () => {
  const errs = [];
  for (const lang of ['zh', 'en', 'ja', 'ko']) {
    const f = `assets/i18n/${lang}.js`;
    if (!exists(f)) { errs.push(`${f} 不存在`); continue; }
    try {
      const content = read(f);
      if (!content.includes('window.I18N')) errs.push(`${f} 缺少 window.I18N`);
    } catch (e) { errs.push(`${f} 读取失败: ${e.message}`); }
  }
  for (const f of HTML_FILES) {
    if (!exists(f)) continue;
    const html = read(f);
    if (!html.includes('class="lang-select"')) errs.push(`${f} 缺少语言下拉`);
    if (!html.includes('value="ja"')) errs.push(`${f} 缺少日语选项`);
    if (!html.includes('value="ko"')) errs.push(`${f} 缺少韩语选项`);
  }
  return errs;
});

/* ---------- 7. JS 语法 ---------- */
test('main.js 语法检查', () => {
  if (!exists('assets/js/main.js')) return ['assets/js/main.js 不存在'];
  const r = spawnSync(process.execPath, ['--check', path.join(ROOT, 'assets/js/main.js')], { encoding: 'utf8' });
  return r.status === 0 ? [] : [r.stderr || 'node --check 失败'];
});

/* ---------- 6. CSS 平衡 ---------- */
test('style.css 括号平衡', () => {
  if (!exists('assets/css/style.css')) return ['assets/css/style.css 不存在'];
  const css = read('assets/css/style.css');
  const errs = [];
  for (const [open, close, name] of [['{', '}', '花括号'], ['(', ')', '圆括号']]) {
    const o = (css.match(new RegExp('\\' + open, 'g')) || []).length;
    const c = (css.match(new RegExp('\\' + close, 'g')) || []).length;
    if (o !== c) errs.push(`style.css ${name}不匹配: ${open}=${o} ${close}=${c}`);
  }
  return errs;
});

/* ---------- 输出 ---------- */
if (JSON_FLAG) {
  console.log(JSON.stringify({ passed: results.filter(r => r.ok).length, failed: failures, results }, null, 2));
} else {
  for (const r of results) {
    console.log((r.ok ? '✅ PASS' : '❌ FAIL') + '  ' + r.name);
    for (const e of r.errors) console.log('        - ' + e);
  }
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} 通过，${failures} 失败`);
  if (failures > 0) console.log('⚠️  存在失败项，禁止发布！');
}
process.exit(failures > 0 ? 1 : 0);
