# 网站端待办与提醒清单（1号员工 官网）

> 本文件记录网站端（`software-download-site/`）相关的待办项与给产品端的提醒。
> 边界：只涉及网站端；1号员工 代码问题仅作提醒，不代改。

- [x] **全站背景**：Gateway Flow 粒子流线背景已接入（verified source 提取，Canvas 2D 零依赖，品牌红褐/信息蓝配色，含 reduced-motion/visibility 降级）

## 待办项（网站端）

- [x] **替换占位符**：安装包直链/SHA256/大小 ✅（specai-1.1.3-win-x64.exe）；homepage 已替换为 spec-ai.cn ✅
- [x] **域名 spec-ai.cn 上线**：✅ 已全线上线（2026-08-24）— 部署方式从 Direct Upload 改为 **Git 集成项目 `spec-ai-website-git`**（Cloudflare Direct Upload 路径存在平台 bug：2026-07 起多起案例，部署记录成功但永不 serving；Git 集成部署实测正常）。`spec-ai.cn` + `www` 已绑定新项目，CNAME 验证 active，https 均 200；`_worker.js`（auth/D1）在 Git 集成下正常工作（/api/stats 未授权 401）
- [x] **pages.dev 激活**：✅ 新项目 `spec-ai-website-git.pages.dev` HTTP 200；旧项目 `spec-ai-website`（Direct Upload）保持 404（平台 bug 弃用，保留项目作记录）
- [ ] **Cloudflare 维护窗口**：2026-08-29（周六）09:00-10:00 UTC 升级核心数据库，期间 Zone 配置变更（DNS/SSL/Pages 绑定）可能短暂失败，避开该时段操作
- [x] **阿里云 OSS 国内下载加速**：✅ 已上线 — Windows 安装包主下载已切换为 OSS 直链（国内加速），GitHub Release 保留为海外备用；后续 macOS/Linux 发布时需同步上传 OSS 并更新 `releases.json`
- [x] **核对截图对应**：✅ 用户已人工核对 `assets/img/scene-*.png` 与首页场景标题匹配；后续换图时再更新
- [ ] **JSON-LD 同步**：`index.html` 中 SoftwareApplication 的 `softwareVersion` 与 `downloadUrl` 需随 `releases.json` 发版同步更新（v1.1.3 已同步：downloadUrl → OSS 直链）
- [ ] **校准发布工作流**：`.github/workflows/release.yml` 中的 electron-builder 命令与产物路径需按 1号员工 源码仓库实际配置调整；确认后由用户决定是否接入
- [ ] **自动更新联调**：electron-updater 的 `latest.yml` 发布链路（属产品端，网站端需在发布后同步版本信息到 `releases.json`）

## 跨站协作提醒（site2 云端智能体）

- [ ] **提醒用户（site2 后端开发到"对账"模块时）**：site2（SPEC-云端智能体，独立仓库 `admin-dashboard/`）设计上会从 site1 账号体系**只读**拉取订阅/用户数据做付费对账（site2 侧 HANDOFF.md/README/PLAN.md 均已记录此唯一跨站数据关联）。当前 site1 生产 D1 已有 3 个注册用户（邮箱 wd_alpha@163.com + 手机号用户 + 开发者账户 dev_web，见下）；届时需在 site1 侧提供只读拉取渠道（现有 `/api/stats` 或用户授权的 D1 导出），**权限由用户开通**。site1 本身无需为此改动代码，等 site2 进入对账开发阶段再提醒用户衔接。

## 生产账号与调试账户（交接信息）

- **注册用户（生产 D1，3 个）**：
  1. `wd_alpha@163.com` — 邮箱注册（邮件通道验证通过）
  2. 手机号用户 — 短信验证码注册（阿里云短信认证通道验证通过）
  3. `dev_web@spec-ai.cn` — 开发者调试账户（2026-08-25 插入，见下）
- **开发者调试账户（电脑侧 App debug/联调用）**：
  - 登录邮箱：`dev_web@spec-ai.cn`（site1 登录接口只接受合法邮箱/手机号，故用邮箱形式；纯 `dev_web` 会被 `invalid_email` 拒绝）
  - 密码：`12345678`（8 位，满足服务端 8-128 位校验；用户原定 6 位 `123456` 不满足，已按确认改用）
  - 计划 `free`、状态 `active`；密码哈希 PBKDF2-SHA256（100,000 迭代，与生产代码一致，插入前本地实测可登录）
  - 插入方式：Cloudflare D1 控制台（`spec-ai-db`，id `435d3dbf-d26b-4f26-b4a3-d946250e0790`）手动执行 INSERT；已生产实测：正确密码登录 200 + token，错误密码 401
  - 变更提示：密码/账户如需调整，直接在 D1 控制台该库执行 SQL（需重新生成 PBKDF2 哈希，格式 `b64url(salt)$b64url(hash)`，见 `_worker.js` `hashPassword`）

- [x] **多语支持**：官网已支持中/英/日/韩四语切换（导航语言按钮，localStorage 记忆）；新文案需同步维护 assets/i18n/ 四语字典
- [x] **访问统计**：✅ Cloudflare Web Analytics 已开通（自动模式，spec-ai.cn，siteTag `ca2da7376ad74236bb68bad65b62e520`）；零代码注入，Pages 开通后自动统计；入口 dash.cloudflare.com → 数据分析 → Web Analytics
- [x] **短信验证码通道（阿里云"短信认证"）**：✅ 已上线（2026-08-25，API v0.6.0）— 服务已开通（dypns.console.aliyun.com，赠送签名"恒创联众"+ 模板 100001/100003/100004）；RAM 子账号 `spec-ai-sms` 已创建并授权 `AliyunDypnsFullAccess`（账号级）；AccessKey 已配置到 Cloudflare 生产环境变量（`ALIYUN_AK_ID`/`ALIYUN_AK_SECRET` secret、`ALIYUN_SMS_SIGN`/`ALIYUN_SMS_TEMPLATE` plain）；`_worker.js` 新增 `sendSmsAliyun`（RPC 签名 HMAC-SHA1，dypnsapi.aliyuncs.com）并接入 `sendCode` 短信分支（阿里云优先、`SMS_WEBHOOK_URL` 回退）；模板优先级已修正（通用 env 对注册/登录生效、不覆盖重置/绑定专用模板）；单测 92/92、门禁 11/11 全绿；**已推送部署**（commit `df736e1`+`125b336`，部署 47193a97 success，生产 API v0.6.0 生效，env 全部注入）——⚠️ **待实测**：手机号真实收码确认赠送模板变量名（${code}/${min}）

- [ ] **订阅档位四档扩展（REQ-001，API v0.7.0）**：✅ 已上线（2026-08-25，部署 35e3035c success）— 档位 `Free/Lite/Pro/Max`（首字母大写，兼容存量小写 free/pro 归一化）；价格月付 Free ¥0 / Lite ¥69.9 / Pro ¥99.9（**Pro 自 ¥19.9 调价**）/ Max ¥199.9，年付=月付×10；权益矩阵按档（并行 1/2/5/10、设备 1/2/3/5、硬件 Lite+、优先响应 Pro+、存储 2/20/100/500GB）；下单接受 Lite/Pro/Max（Free→plan_free、未知→invalid_plan，不再静默降级）；pricing.html 四列一排 Pro 高亮 + 价格动态渲染；account.js 四档显示；i18n 四语新增 lite/max 文案；单测 108/108、门禁 11/11；**生产实测**：/api/plans 四档金额正确、Lite/Pro/Max 下单金额正确、Hacker→invalid_plan、Free→plan_free、Free 档 license 权益正确（Lite/Max 权益由单测覆盖，生产升档需支付通道或 DEV 环境）

## 给产品端的提醒（不代改，仅提醒）

- [ ] **仓库 logo 文件带病**：`opc-employee-1-v3-fork/logo/specai-logo.svg` 第 1 行重复 `xmlns` 属性（非法 XML）。网站端副本已修复；仓库原文件建议由产品端择机修复，否则任何拷贝/构建环节用到都会出问题
- [ ] **网站端 logo 是静态拷贝**：若产品端更新官方 logo，需确认后手动替换网站端 `assets/img/specai-logo.svg`（替换前检查 XML 合法性）；不要用脚本自动覆盖（会把修好的文件覆盖回带病版本）
- [ ] **代码签名**：Windows 正式发布需配置代码签名证书消除 SmartScreen 警告（当前为自签名开发证书）；macOS 版本需 Developer ID 公证

## 流程约定

- 网站端改动：我先自检（语法、渲染、像素验证）通过后，再通知用户确认
- 涉及重大决策（品牌、视觉、架构）：先与用户逐一确认，批准后再执行
- **Git 推送规则（2026-08-24 用户明确）**：日常开发提交仅在本地（`git commit`），**不 push 到 GitHub**；需要同步远端时，须用户明确允许或用户主动告知。注意：Cloudflare 是 Git 集成部署（push 即上线），因此**不推送 = 不上线**，线上更新需用户授权 push
- **API 自检长期约定（2026-08-25 用户确认，源自 BUG-001 CORS 预检 500 漏检）**：凡改动 `_worker.js` 路由/响应，自检必须覆盖**浏览器协议层**，不能只做功能路径验证：
  1. **OPTIONS 预检**：单测必须发送带 `Origin` + `Access-Control-Request-Method` + `Access-Control-Request-Headers` 的 OPTIONS 请求，断言 204 无 body + CORS 头齐全（`tests/worker-unit.js` 已有 CORS 预检回归用例，保持不删）
  2. **浏览器语义而非 curl/Node 直连**：Node/curl 直连不受 CORS 约束，会绕开预检类 bug——涉及认证/许可/订阅等带 JSON/Authorization 头的接口改动，除直连验证外，需用带 Origin 的预检语义确认
  3. **204/304 等 null-body 状态码**：不得经 `json()`（总会带 body）返回；须 `new Response(null, {...})`
