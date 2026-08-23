# SPEC 品牌 · 网站设计规范 v1.0

> 适用：SPEC 品牌（1号员工 / Digital AI Employee 1#）旗下**所有网站**——官网、产品页、文档站、活动页等。
> 目标：从零搭建第二个（及以后每个）网站时，直接按此规范开发、验证、发布，保证品牌一致性。
> 参考实现：`software-download-site/`（1号员工 官网，本规范即由该站提炼）。

---

## 0. 规范速览（30 秒版）

- **理念**：D+B —— DeepSeek 质感打底 + 红褐品牌锚点。全站**锁定深色主题**。
- **主色**：红褐 `#c25b43`（暗）/ `#a8432e`（亮），呼应 App 图标红 `#842018`。
- **底色**：中性蓝灰 `#101216`（暗）/ `#f7f8fa`（亮）。
- **信息蓝**：仅用于 info 类（版本号、链接、状态）：`#5b8def`（暗）/ `#4176e6`（亮）。
- **字体**：系统字体栈（无外部字体依赖，国内访问友好），中文回退在拉丁之后。
- **风格纪律**（taste-skill）：无步骤数字、无破折号（—）、每行 ≤1 个间隔点（·）、单一强调色、AA 对比度、无装饰性圆点、页脚不显示版本号。
- **技术栈**：零依赖静态 HTML/CSS/原生 JS + Cloudflare Pages（advanced worker + D1 后端）。
- **验证**：`node tests/run-tests.js`（11 项门禁）+ 后端单测（74 用例）+ GitHub Actions CI（Node 24）。

---

## 1. 品牌定位与设计理念

### 1.1 D+B 体系
- **D（DeepSeek 质感）**：深色、克制、信息密度高、强调工具感与技术感。底色为中性蓝灰而非纯黑，文字层级清晰。
- **B（Brand 锚点）**：红褐色作为唯一品牌强调色，贯穿行动按钮、hover、徽章、分隔元素；其他颜色只承担语义角色（绿=成功/就绪、琥珀=即将推出、蓝=信息、灰=次要）。

### 1.2 语气
- 中文优先（中/英/日/韩四语），文案直白、去营销腔。
- 称呼用户为"您"；产品人格化（"不是工具，是同事"）。

---

## 2. 色彩体系（设计令牌）

### 2.1 暗色主题（全站默认，必须实现）

| Token | 值 | 用途 |
|---|---|---|
| `--aou-6` / `--accent` | `#c25b43` | 主行动色 |
| `--aou-7` / `--accent-hover` | `#d97a62` | hover |
| `--aou-8` / `--accent-soft` | `#e8a08c` | 浅红褐文字（深底）、kicker、accent 高亮字 |
| `--aou-9` | `#f3c8ba` | 更高亮（极少用） |
| `--ink` | `#101216` | 主背景 |
| `--ink-2` | `#17191d` | 卡片/次级表面 |
| `--ink-3` | `#1d2025` | 三级表面/分隔/输入框底 |
| `--ink-4` | `#262a31` | 边框加强 |
| `--info` | `#5b8def` | 信息蓝（版本号、链接、提示） |
| `--text-primary` | `#e8eaee` | 主文字 |
| `--text-secondary` | `#a6acb6` | 次级文字 |
| `--text-muted` | `#6c727c` | 弱化文字（脚注、说明） |
| `--line` | `rgba(255,255,255,.14)` | 分隔线 |
| `--line-soft` | `rgba(255,255,255,.08)` | 弱分隔线 |

### 2.2 亮色主题（预留，如未来需要）
- 主背景 `#f7f8fa`，主行动色 `#a8432e`，信息蓝 `#4176e6`，文字按对比度反推（主 `#1c2026` 系）。

### 2.3 语义状态色（独立于品牌强调色）
| 状态 | 颜色 |
|---|---|
| 就绪/成功 | `#3fbf77` |
| 即将推出 | `#d9a13c` |
| 评估中/次要 | `#a6acb6` |
| 危险/错误 | `#e0605a` |

### 2.4 使用规则
1. **单一强调色**：一次只用一个强调色（品牌红褐）。物理世界/特殊场景按钮才允许第二种（如硬件页"虚拟接入"用翡翠绿 `#178a4d`，需用户明确批准）。
2. 信息蓝只用于 info 语义，不用于行动。
3. 所有文字与底色须达 **AA 对比度**（4.5:1 正文 / 3:1 大字）。

---

## 3. 字体体系

### 3.1 字体栈（系统栈，无外部依赖）
```css
--sans: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC",
        -apple-system, "Segoe UI", system-ui, sans-serif;
--mono: "Cascadia Code", "JetBrains Mono", Consolas, "SF Mono", Menlo,
        "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", monospace;
```
> 关键：**CJK 字体必须放在拉丁字体之后**（mono 栈里 CJK 在最后），否则中文在 mono 元素里会回退到衬线。

### 3.2 字号阶梯（clamp 响应式）
| 用途 | 值 |
|---|---|
| Hero 标题 | `clamp(40px, 5.6vw, 62px)` / 900 / -0.02em / 1.08 |
| 区块标题 | `clamp(28px, 4.5vw, 42px)` / 900 |
| 页面 Hero 标题 | `clamp(30px, 4.5vw, 44px)` / 900 |
| CTA 标题 | `clamp(30px, 5vw, 48px)` / 900 |
| Hero 副文 | `clamp(15.5px, 1.9vw, 17.5px)` |
| 卡片标题 | 16–19px / 700–800 |
| 正文 | 14–14.5px |
| 按钮 | 16px / 700（大按钮）；13.5px / 600（小胶囊） |
| 说明/脚注 | 11.5–13px |
| 404 码 | `clamp(80px, 16vw, 160px)` / 900 / mono / 文字镂空 |

### 3.3 使用规则
- 数字/版本/哈希/代码：一律 `var(--mono)`。
- Kicker（区块小标签）：mono / 13px / 0.14em 字距 / 大写 / `--accent-soft`。
- 品牌语录（页眉）：斜体 / 12.5px / 1.5 行高 / `--text-secondary`。

---

## 4. 布局与间距

| 项 | 值 |
|---|---|
| 内容最大宽 | `--maxw: 1100px`（container 居中） |
| 圆角 | `--radius: 10px`；胶囊/标签 `999px` |
| 区块上下留白 | `96px`（`.section`）；紧凑 `56px`（`.section-tight`）；更紧凑 `40px`（`.section-tight-sm`） |
| 区块标题下间距 | `56px` |
| 网格栅格 | 能力区 12 列 Bento（`span 6` 大卡 / `span 4` 小卡 / 可跨列） |
| 卡片网格 | 3 列（`.dl-grid`，gap 22px）；移动端 1 列 |
| 阴影 | 浮起 `--shadow-pop: 0 18px 50px rgba(7,9,12,.45)`；主按钮 hover `0 12px 30px rgba(194,91,67,.4)` |
| 移动断点 | `960px`（导航文字链接隐藏）；`560px`（统计卡单列） |

---

## 5. 组件规范

### 5.1 导航（顶部固定）
- `.site-nav`：吸顶，滚动后加 `is-scrolled`（加深背景）。
- 结构：`品牌(logo+语录)` + `nav-links` + 行动按钮 + 语言选择器。
- 纯文字链接 `.nav-link-text`：14.5px / `--text-secondary`，hover 变 `--text-primary`；**≤960px 隐藏**。
- 胶囊按钮 `.nav-gh`：13.5px/600 / 边框 `--line` / 圆角 999px / 高 34px / 内边距 0 16px / hover 品牌描边 + 品牌底 12% 透明。
- 品牌底按钮 `.nav-gh-brand`：`--accent` 底白字；hover `--accent-hover` + 品牌投影。
- **等宽纪律**：同排胶囊按钮（含语言选择器）取当前语言最大宽度统一（JS 测量对齐）。
- 语言选择器 `.lang-select`：13.5px/600 / `--ink-3` 底 / 圆角 999px / 右箭头 SVG（`#a6acb6`）。

### 5.2 按钮
| 类型 | 样式 |
|---|---|
| `.btn-primary` | `--accent` 底白字；hover `--accent-hover` + 投影 + `translateY(-2px)`；箭头 `→` 随 hover 右移 4px |
| `.btn-ghost-dark` | 边框 `--line` / 主文字；hover 边框提亮 + 上浮 |
| `.btn-danger` | 透明底 / 红描边 `rgba(224,96,90,.5)` / 红字 `#e0605a` |
| 基础 `.btn` | 16px/700 / 内边距 14px 30px / 圆角 `--radius` |

### 5.3 卡片与徽章
- `.dl-card`：`--ink-2` / 边框 `--line-soft` / 圆角 / hover `translateY(-4px)` + 边框品牌色 40%。
- `.cap-item`（能力卡）：同上，Bento 栅格；内嵌图标/标签。
- `.plan-card`（定价卡）：Pro 卡边框品牌色 50% 强调。
- `.status-badge`：小圆角标签（语义色见 2.3），mono 前缀风格可加。

### 5.4 表单与账户
- 输入框：`--ink` 底 / 边框 `--line` / 圆角 10px / 聚焦边框品牌色 55%。
- 验证码行：输入框 + 「获取验证码」按钮（60s 倒计时）。
- 表单校验错误：红色 `#e0605a`；成功提示：信息蓝。
- 危险操作（注销）：`.btn-danger` + 二次确认表单。

### 5.5 页脚
- `.site-footer`：`rgba(16,18,22,.92)` 底 / 上边框 `--line` / 内边距 44px 0 36px。
- 结构：品牌简介（左）+ 栏目列（产品 / 定价 / 社区，gap 56px）。
- 栏目：标题 13px / 主文字；链接 14px / `--text-secondary`，hover 品牌色。
- `.footer-bottom`：版权 + 托管信息（info-blue），13px，上边框。

### 5.6 页面骨架
- 首页 Hero：左文案（eyebrow 胶囊 + 大标题 + 副文 + 下载区）+ 右截图（非对称 Split）。
- 子页 `.page-hero`：`rgba(16,18,22,.88)` 底 / 上边框 64px 下 56px / 下边框 `--line-soft`。
- `.section-alt`：`rgba(23,25,29,.88)` 底（明度层次）。
- CTA 带 `.cta-band`：大标题 + 主按钮 + 次级按钮。
- 404：`.err-code` 超大镂空 mono 数字（`-webkit-text-stroke: 2px var(--accent)`）+ 返回首页按钮。

---

## 6. 动效规范

| 动效 | 参数 |
|---|---|
| 滚动显现 `.reveal` | 初始 `opacity:0; translateY(26px)` → `.in` 恢复；0.6s ease |
| Hero 入场 `.fade-item` | `fadeUp`（18px→0）0.7s ease forwards；延迟 d1=0.08s d2=0.18s d3=0.3s d4=0.44s |
| 按钮 hover | 上浮 2px + 投影（0.16s） |
| Tab 切换 | 背景/颜色 0.18s |
| 背景粒子 | 见 §7 |
| **reduced-motion** | `@media (prefers-reduced-motion: reduce)` 强制动画 0.01ms、reveal/fade 直接可见、粒子静止帧 |

---

## 7. 背景系统（Gateway Flow 粒子）

- Canvas 全屏固定，`aria-hidden`，opacity 0.6，`z-index: -1`。
- **左侧粒子**：红褐 `rgba(232,160,140,0.72)`（= `--aou-8`），活动带 `top 8%–58%`。
- **右侧粒子**：信息蓝 `rgba(110,158,244,0.8)`，活动带 `bottom 42%–92%`。
- **连线**：红褐 `rgba(194,91,67,0.28)`（= `--accent` 28%），距离阈值内成线。
- 运动：两侧向中间汇聚，近中心 `easeInOut` 减速，形成"汇合"感。
- 降级：`prefers-reduced-motion` → 静态帧；`visibilitychange` 暂停；移动端可降低粒子密度。

---

## 8. 页面架构与信息结构

- 页面类型：首页（转化）、下载页、更新日志、功能/硬件页、登录/账户、定价（个人）、企业方案、404。
- 导航纪律：**顶部只放高频行动入口**（产品页在首页 Hero 已有入口时，顶部可不再放文字链接）；低频入口放页脚。
- 页脚纪律：产品 / 定价（个人、企业、联系专员）/ 社区 三列。
- SEO：每页 `title` + `description`；首页 JSON-LD `SoftwareApplication`（name/version/downloadUrl/offers）；账户类页面 `noindex`。
- 访问统计：Cloudflare Web Analytics（自动模式，零代码）。

---

## 9. 国际化（i18n）系统

- 语言：中 / 英 / 日 / 韩（`zh` `en` `ja` `ko`），`localStorage` 记忆（键 `dsh-site-lang`）。
- 字典：`assets/i18n/{lang}.js`，暴露 `window.I18N = {...}`；动态加载带 `?t=Date.now()` 防缓存；首屏字典（zh）用固定版本号 `zh.js?v=N`，改字典必须 **N+1**。
- 标记：可见文本加 `data-i18n="key"`；图片 alt 用 `data-i18n-alt`。
- 机制：`applyStaticI18n` **只替换文本节点、保留子元素**（箭头、出处标签不被销毁）；动态渲染（下载按钮、卡片、统计）用 `t(key, fallback)`。
- 纪律：新增文案必须四语同步；每语言语义一致而非逐字直译。

---

## 10. 文案规范（taste-skill 反 AI 味）

1. **无步骤数字**（01/02/03 装饰编号）。
2. **无破折号**（`—`）；用逗号或分句。
3. **每行最多 1 个间隔点**（`·`）。
4. **无装饰性圆点**（列表装饰用品牌色方块/对勾代替）。
5. **单一强调色**；任何第二强调色需批准。
6. **AA 对比度**（正文 4.5:1）。
7. **页脚不显示版本号**；版本号只出现在必要处（下载页、changelog、JSON-LD）。
8. 按钮文案动词开头（下载、登录、订阅、开始使用）。
9. 无营销空话，直白描述能力。
10. 品牌名规范：产品名 "1号员工"，英文 "Digital AI Employee 1#"；"第一位" 用汉字不混阿拉伯数字（"第一位"而非"第1位"）。

---

## 11. 后端与账户体系（可选模块）

> 完整接口文档见同仓库 `APP-API.md`。仅当第二个网站需要账号/订阅时启用。

- **架构**：Cloudflare Pages advanced worker（`_worker.js`，ESM `export default { fetch }`）+ D1（SQLite）+ Web Crypto（零 npm 依赖）。
- **静态回退**：`env.ASSETS.fetch(request)` 服务所有非 `/api/*` 路径——静态页与后端共存。
- **数据表**：users / subscriptions / orders / login_logs / verify_codes / devices（`CREATE TABLE IF NOT EXISTS` 幂等 + ALTER 迁移）。
- **认证**：邮箱+密码（PBKDF2-SHA256 21 万次迭代）或手机+验证码；JWT（HMAC-SHA256，30 天）。
- **安全**：验证码一次性 10 分钟、登录失败 5 次/10 分钟、发码 5 次/小时/目标、注册 10 次/小时/IP、token 版本号撤销（改密/注销/重置后旧 token 失效）。
- **订阅**：计划常量（`PLANS`）集中配置；订单/激活/支付回调预留。
- **许可**：`/api/license/check` 返回权益矩阵（并行任务/设备上限/硬件/优先级/存储），设备绑定限数。
- **环境变量**：`JWT_SECRET`（必须）、`DEV_MODE`（生产 0）、`RESEND_API_KEY`/`MAIL_FROM`（邮件验证码）、`SMS_WEBHOOK_URL`（短信钩子）。

---

## 12. 验证标准（发布门禁）

- `node tests/run-tests.js`（**发布前必须全绿**）：
  1. HTML 存在且标签平衡（含所有页面）
  2. HTML 关键挂载点存在（`REQUIRED_IDS`）
  3. releases.json 语法与结构
  4. 平台数据与下载链接门禁（受信任源白名单）
  5. **占位符阻断**（`REPLACE_WITH`/`yourname`/`yourdomain`/`NovaDesk`，严格模式）
  6. HTML 引用资源存在
  7. i18n 四语字典与切换器
  8. main.js 语法检查
  9. `_worker.js` 语法检查
  10. 后端单测（`tests/worker-unit.js`，本地真实 SQLite 模拟 D1，当前 74 用例）
  11. style.css 括号平衡
- **CI**：GitHub Actions，Node **24**（后端单测依赖 `node:sqlite`），push 自动跑。
- 新增页面必须：加入 `HTML_FILES` + `REQUIRED_IDS` + 四语字典 + 版本号 bump。

---

## 13. 发布与运维（Cloudflare Pages）

- **部署**：`scripts/deploy.py`（Direct Upload API）：环境变量 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_PAGES_PROJECT`；自动排除 `scripts/`、文档 `.md`、`vercel.json`。
- **安全头**：`_headers` 文件（`nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy` + `/assets/*` immutable 缓存、`/data/releases.json` 短缓存）。
- **域名**：zone 托管 Cloudflare（NS 指向 Cloudflare），Pages 项目 Custom domains 绑定主域 + `www`，CNAME proxied。
- **环境变量**：在控制台 设置→变量和密钥 配置（API 无权限，需手动/浏览器操作）。
- **统计**：Web Analytics 自动模式（对代理域名零代码注入）。
- **版本缓存纪律**：改 `main.js`/`zh.js`/`style.css` 时全站 bump 版本参数；字典每次改必 bump。
- **流程**：改代码 → 本地测试全绿 → commit → push（CI 自动验证）→ `python scripts/deploy.py` → 线上验证。

---

## 14. 第二个网站搭建流程（Checklist）

### A. 初始化
- [ ] 复制设计令牌（§2 色彩、§3 字体、§4 布局）到 `style.css` 顶部
- [ ] 基础骨架：bg-canvas + nav + footer + 首个页面
- [ ] 复制 i18n 骨架（四语空字典 + `main.js` 加载器）
- [ ] 复制粒子背景 `background.js`

### B. 页面开发
- [ ] 按 §5 组件拼装（nav 胶囊/按钮/卡片/徽章/表单）
- [ ] 文案过 §10 taste-skill 检查
- [ ] 每页 title/description + 需要时 JSON-LD

### C. 后端（如需）
- [ ] 复制 `_worker.js` 骨架（路由 + ASSETS 回退 + D1 建表）
- [ ] 按 `APP-API.md` 接认证/订阅/许可
- [ ] 配置环境变量

### D. 验证
- [ ] `tests/run-tests.js` 全绿；后端单测全绿
- [ ] CI（Node 24）通过
- [ ] 移动端断点 + reduced-motion 检查
- [ ] 四语切换无漏译

### E. 发布
- [ ] `_headers` 安全头；`robots.txt`/`sitemap`（如需）
- [ ] `python scripts/deploy.py` 部署
- [ ] 域名绑定 + HTTPS 验证
- [ ] Web Analytics 开通
- [ ] 上线后回归（页面/下载/登录/订阅/许可）

---

*规范维护：随 1号员工 官网迭代同步更新；重大品牌决策（色彩/字体/风格）需用户确认。*
