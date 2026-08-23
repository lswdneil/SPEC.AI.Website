# 1号员工 官网（Digital AI Employee 1#）

**1号员工**（Digital AI Employee 1#）的对外发布与升级官网。
品牌体系遵循已拍板的 **D+B** 方案：DeepSeek 质感打底 + **红褐品牌锚点**（`#a8432e` 亮 / `#c25b43` 暗，呼应 App 图标红 `#842018`），中性蓝灰底（亮 `#f7f8fa` / 暗 `#101216`），信息蓝 `#4176e6` 仅用于 info 类。

- 零依赖纯静态站：HTML + CSS + 原生 JS，无需构建工具
- 托管于 **Cloudflare Pages**（免费、全球 CDN、自动 HTTPS、Direct Upload 部署）
- 安装包主下载走 **阿里云 OSS**（国内直连加速），GitHub Releases 作海外备用
- 下载数据集中在 `data/releases.json`，发版只需改一个文件
- 附带 GitHub Actions 三平台自动构建发布工作流
- **账户体系后端**：`_worker.js`（Cloudflare Pages advanced worker + D1），App 端对接见 [APP-API.md](APP-API.md)
- **品牌设计规范**：SPEC 品牌所有网站的从零搭建指南，见 [BRAND-DESIGN-SPEC.md](BRAND-DESIGN-SPEC.md)

---

## 目录结构

```
software-download-site/
├── index.html           # 首页（Hero / 能力特性 / 场景 / CTA）
├── download.html        # 下载页（平台卡片 + 文件清单 + 校验值）
├── changelog.html       # 更新日志页
├── hardware.html        # 物理接入页（AI 硬件形态 / 接入方式 / 开放能力）
├── 404.html
├── data/
│   └── releases.json    # ★ 唯一需要维护的数据文件
├── assets/
│   ├── img/             # logo / 应用截图 / 图标
│   ├── css/style.css    # D+B 品牌令牌与样式
│   └── js/main.js       # 平台识别 / 动态渲染 / 复制校验值
├── scripts/
│   └── deploy.py        # ★ Cloudflare Pages 部署脚本（Direct Upload API）
├── .github/workflows/
│   └── release.yml      # ★ 桌面应用的自动发布工作流（放软件仓库）
├── vercel.json          # Vercel 遗留配置（Cloudflare 下无作用，可删除）
└── README.md
```

## 快速开始

1. 把本目录推到一个新的 GitHub 仓库（网站仓库）。
2. 修改 `data/releases.json`：
   - `product.repo` / `homepage` → 实际仓库与域名
   - `platforms.windows.files[].url` → 您的安装包真实下载链接
   - `sha256` → 安装包真实校验值（本地 `certutil -hashfile 文件 SHA256` 或 `sha256sum 文件`）
   - `changelog` → 版本历史
3. 本地预览：`python -m http.server 8080` → 打开 `http://localhost:8080`。
4. 部署：设置 `CLOUDFLARE_API_TOKEN`（Pages 权限）后运行 `python scripts/deploy.py`，自动上传全部静态文件到 Cloudflare Pages；也可在控制台 Workers & Pages → 创建项目 → **Direct Upload** 手动拖拽。
5. 绑定域名：`spec-ai.cn` 的 zone 已在 Cloudflare（NS：`merlin.ns.cloudflare.com` / `reza.ns.cloudflare.com`），在 Pages 项目 Custom domains 中添加 `spec-ai.cn` 与 `www.spec-ai.cn`，Cloudflare 会自动创建 CNAME 指向 `spec-ai-website.pages.dev`。

> 品牌信息如需微调（颜色、文案、logo），改动集中在 `assets/css/style.css` 顶部令牌、三个 HTML 与 `releases.json`。

## 发布新版本

**手动**：打 tag 发布 GitHub Release → 复制安装包直链 → 更新 `releases.json` → push → 运行 `python scripts/deploy.py` 重新部署。

**全自动**：把 `.github/workflows/release.yml` 复制到 1号员工 **软件源码仓库**（`github.com/lswdneil/Digital-AI-Employee`），推送 `v*` tag 即自动在 Windows/macOS/Linux 构建安装包、生成 SHA256 并发布到 Releases。工作流中 electron-builder 命令与产物路径需按源码仓库实际配置调整。

> 进阶：可用 GitHub Actions 在 Release 创建后自动同步最新版本信息到本站 `releases.json`，实现"打 tag → 官网自动更新"。

## 桌面应用自动更新

下载页已展示校验值；应用内静默升级需在源码仓库配置：

- **Electron + electron-builder**：配置 `publish` 指向 GitHub 仓库，发布时自动生成 `latest.yml`（工作流已包含），应用内用 `electron-updater` 检测更新。
- **代码签名**：Windows 用代码签名证书消除 SmartScreen 警告；macOS 用 Developer ID 公证（当前为自签名开发证书，见 HANDOFF.md）。

## 部署与国内访问

- **现状**：站点托管于 Cloudflare Pages（全球 CDN、自动 HTTPS）；安装包主下载走阿里云 OSS（上海节点、国内直连加速），GitHub Releases 作海外备用。
- **域名**：`spec-ai.cn` 已托管到 Cloudflare（NS：`merlin.ns.cloudflare.com` / `reza.ns.cloudflare.com`），自定义域名已绑定 Pages 项目。
- **备案**：当前走境外路线不备案；若后续需要接入国内云（有备案主体），可把安装包迁移到 OSS + CDN 并保持下载链接不变。
- **Vercel 遗留**：`vercel.json` 是早期 Vercel 部署的响应头配置，Cloudflare 下无作用，可删除。

## 常见问题

- **下载按钮为何自动识别系统？** `main.js` 读浏览器 UA 选择平台；macOS/Linux 无安装包时显示"即将推出"。
- **没有 GitHub 仓库？** 把 `releases.json` 的 `url` 换成 OSS/COS 直链即可，其余不变。
- **想要下载统计？** 用 GitHub API 统计 Release 资产下载量，或在前端点击事件上报。
- **场景区截图**：`assets/img/scene-*.png` 已按文件名语义选配，建议人工核对每张图内容与标题是否对应，不符则替换。

---

## License

本项目基于 **MIT License** 开源，详见 [LICENSE](LICENSE) 文件。
