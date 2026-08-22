# 网站端待办与提醒清单（1号员工 官网）

> 本文件记录网站端（`software-download-site/`）相关的待办项与给产品端的提醒。
> 边界：只涉及网站端；1号员工 代码问题仅作提醒，不代改。

## 待办项（网站端）

- [ ] **替换占位符**：`data/releases.json` 中的安装包直链（`url`）、`sha256`、`homepage`（域名）上线前必须替换为真实值
- [x] **替换真实截图**：首页 Hero 与场景区已换为 1号员工 真实截图（app-hero.png / scene-work / scene-team / scene-office）
- [ ] **核对截图对应**：截图是按文件名语义选配的（对话工作台/编排/办公文档），请人工核对每张图内容与标题是否对应，不符则替换 `assets/img/scene-*.png`
- [ ] **JSON-LD 同步**：`index.html` 中 SoftwareApplication 的 `softwareVersion` 与 `downloadUrl` 需随 `releases.json` 发版同步更新
- [ ] **校准发布工作流**：`.github/workflows/release.yml` 中的 electron-builder 命令与产物路径需按 1号员工 源码仓库实际配置调整（如 `npm run dist:win:reliable`）；确认后由用户决定是否接入
- [ ] **自动更新联调**：electron-updater 的 `latest.yml` 发布链路（属产品端，网站端需在发布后同步版本信息到 `releases.json`）
- [ ] **域名绑定**：Vercel 部署后绑定正式域名（DNS CNAME → `cname.vercel-dns.com`）；国内访问优化方案（优选 CNAME / 备案 / OSS+CDN）择一执行

## 给产品端的提醒（不代改，仅提醒）

- [ ] **仓库 logo 文件带病**：`opc-employee-1-v3-fork/logo/specai-logo.svg` 第 1 行重复 `xmlns` 属性（非法 XML）。网站端副本已修复；仓库原文件建议由产品端择机修复，否则任何拷贝/构建环节用到都会出问题
- [ ] **网站端 logo 是静态拷贝**：若产品端更新官方 logo，需确认后手动替换网站端 `assets/img/specai-logo.svg`（替换前检查 XML 合法性）；不要用脚本自动覆盖（会把修好的文件覆盖回带病版本）
- [ ] **代码签名**：Windows 正式发布需配置代码签名证书消除 SmartScreen 警告（当前为自签名开发证书）；macOS 版本需 Developer ID 公证

## 流程约定

- 网站端改动：我先自检（语法、渲染、像素验证）通过后，再通知用户确认
- 涉及重大决策（品牌、视觉、架构）：先与用户逐一确认，批准后再执行
