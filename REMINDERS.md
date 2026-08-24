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

- [x] **多语支持**：官网已支持中/英/日/韩四语切换（导航语言按钮，localStorage 记忆）；新文案需同步维护 assets/i18n/ 四语字典
- [x] **访问统计**：✅ Cloudflare Web Analytics 已开通（自动模式，spec-ai.cn，siteTag `ca2da7376ad74236bb68bad65b62e520`）；零代码注入，Pages 开通后自动统计；入口 dash.cloudflare.com → 数据分析 → Web Analytics

## 给产品端的提醒（不代改，仅提醒）

- [ ] **仓库 logo 文件带病**：`opc-employee-1-v3-fork/logo/specai-logo.svg` 第 1 行重复 `xmlns` 属性（非法 XML）。网站端副本已修复；仓库原文件建议由产品端择机修复，否则任何拷贝/构建环节用到都会出问题
- [ ] **网站端 logo 是静态拷贝**：若产品端更新官方 logo，需确认后手动替换网站端 `assets/img/specai-logo.svg`（替换前检查 XML 合法性）；不要用脚本自动覆盖（会把修好的文件覆盖回带病版本）
- [ ] **代码签名**：Windows 正式发布需配置代码签名证书消除 SmartScreen 警告（当前为自签名开发证书）；macOS 版本需 Developer ID 公证

## 流程约定

- 网站端改动：我先自检（语法、渲染、像素验证）通过后，再通知用户确认
- 涉及重大决策（品牌、视觉、架构）：先与用户逐一确认，批准后再执行
- **Git 推送规则（2026-08-24 用户明确）**：日常开发提交仅在本地（`git commit`），**不 push 到 GitHub**；需要同步远端时，须用户明确允许或用户主动告知。注意：Cloudflare 是 Git 集成部署（push 即上线），因此**不推送 = 不上线**，线上更新需用户授权 push
