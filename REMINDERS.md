# 网站端待办与提醒清单（1号员工 官网）

> 本文件记录网站端（`software-download-site/`）相关的待办项与给产品端的提醒。
> 边界：只涉及网站端；1号员工 代码问题仅作提醒，不代改。

- [x] **全站背景**：Gateway Flow 粒子流线背景已接入（verified source 提取，Canvas 2D 零依赖，品牌红褐/信息蓝配色，含 reduced-motion/visibility 降级）

## 待办项（网站端）

- [x] **替换占位符**：安装包直链/SHA256/大小 ✅（specai-1.1.3-win-x64.exe）；homepage 已替换为 spec-ai.cn ✅
- [ ] **域名 spec-ai.cn 上线收尾**：✅ 注册局审核 ✅ 实名（clientHold 已解除）✅ Cloudflare zone 已激活 ✅ NS 已切（merlin/reza）✅ Pages 已绑定 `spec-ai.cn` + `www`（均 active）✅ 部署成功（2559050b）→ ⏳ **账号级 Pages 服务未开通**：API 显示部署/域名全 active，但账号下 0 个 Workers 脚本（pages-worker--18173810-production 未创建），所有 URL 返回空 404；新账号 pages.dev 官方最长 48h（8/22 12:00 UTC 起算）→ 若到 8/24 12:00 UTC 仍 404，带此诊断到 support.cloudflare.com 开工单
- [ ] **Cloudflare 维护窗口**：2026-08-29（周六）09:00-10:00 UTC 升级核心数据库，期间 Zone 配置变更（DNS/SSL/Pages 绑定）可能短暂失败，避开该时段操作
- [x] **阿里云 OSS 国内下载加速**：✅ 已上线 — Windows 安装包主下载已切换为 OSS 直链（国内加速），GitHub Release 保留为海外备用；后续 macOS/Linux 发布时需同步上传 OSS 并更新 `releases.json`
- [ ] **pages.dev 激活**：周期检查后台运行中（30分钟/次），激活后自动通知；激活后先以 pages.dev 上线，域名生效后绑定 spec-ai.cn
- [ ] **核对截图对应**：截图是按文件名语义选配的，请人工核对每张图内容与标题是否对应，不符则替换 `assets/img/scene-*.png`
- [ ] **JSON-LD 同步**：`index.html` 中 SoftwareApplication 的 `softwareVersion` 与 `downloadUrl` 需随 `releases.json` 发版同步更新（v1.1.3 已同步：downloadUrl → OSS 直链）
- [ ] **校准发布工作流**：`.github/workflows/release.yml` 中的 electron-builder 命令与产物路径需按 1号员工 源码仓库实际配置调整；确认后由用户决定是否接入
- [ ] **自动更新联调**：electron-updater 的 `latest.yml` 发布链路（属产品端，网站端需在发布后同步版本信息到 `releases.json`）

- [x] **多语支持**：官网已支持中/英/日/韩四语切换（导航语言按钮，localStorage 记忆）；新文案需同步维护 assets/i18n/ 四语字典

## 给产品端的提醒（不代改，仅提醒）

- [ ] **仓库 logo 文件带病**：`opc-employee-1-v3-fork/logo/specai-logo.svg` 第 1 行重复 `xmlns` 属性（非法 XML）。网站端副本已修复；仓库原文件建议由产品端择机修复，否则任何拷贝/构建环节用到都会出问题
- [ ] **网站端 logo 是静态拷贝**：若产品端更新官方 logo，需确认后手动替换网站端 `assets/img/specai-logo.svg`（替换前检查 XML 合法性）；不要用脚本自动覆盖（会把修好的文件覆盖回带病版本）
- [ ] **代码签名**：Windows 正式发布需配置代码签名证书消除 SmartScreen 警告（当前为自签名开发证书）；macOS 版本需 Developer ID 公证

## 流程约定

- 网站端改动：我先自检（语法、渲染、像素验证）通过后，再通知用户确认
- 涉及重大决策（品牌、视觉、架构）：先与用户逐一确认，批准后再执行
