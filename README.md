# 1号员工 官网（Digital AI Employee 1#）

**1号员工**（Digital AI Employee 1#）的对外发布与升级官网。
品牌体系遵循已拍板的 **D+B** 方案：DeepSeek 质感打底 + **红褐品牌锚点**（`#a8432e` 亮 / `#c25b43` 暗，呼应 App 图标红 `#842018`），中性蓝灰底（亮 `#f7f8fa` / 暗 `#101216`），信息蓝 `#4176e6` 仅用于 info 类。

- 零依赖纯静态站：HTML + CSS + 原生 JS，无需构建工具
- 托管于 **Vercel**（免费、全球 CDN、自动 HTTPS、GitHub 自动部署）
- 安装包由 **GitHub Releases** 免费分发
- 下载数据集中在 `data/releases.json`，发版只需改一个文件
- 附带 GitHub Actions 三平台自动构建发布工作流

---

## 目录结构

```
software-download-site/
├── index.html           # 首页（Hero / 能力特性 / 场景 / CTA）
├── download.html        # 下载页（平台卡片 + 文件清单 + 校验值）
├── changelog.html       # 更新日志页
├── 404.html
├── data/
│   └── releases.json    # ★ 唯一需要维护的数据文件
├── assets/
│   ├── img/specai-logo.svg   # SPEC.AI 品牌 logo（取自仓库 logo/）
│   ├── css/style.css    # D+B 品牌令牌与样式
│   └── js/main.js       # 平台识别 / 动态渲染 / 复制校验值
├── .github/workflows/
│   └── release.yml      # ★ 桌面应用的自动发布工作流（放软件仓库）
├── vercel.json
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
4. 部署：Vercel 导入仓库 → 框架预设选 **Other** → Deploy（纯静态，无需构建命令）。
5. 绑定域名：Vercel → Settings → Domains，把域名 CNAME 指向 `cname.vercel-dns.com`。

> 品牌信息如需微调（颜色、文案、logo），改动集中在 `assets/css/style.css` 顶部令牌、三个 HTML 与 `releases.json`。

## 发布新版本

**手动**：打 tag 发布 GitHub Release → 复制安装包直链 → 更新 `releases.json` → push，Vercel 自动部署。

**全自动**：把 `.github/workflows/release.yml` 复制到 1号员工 **软件源码仓库**（`github.com/lswdneil/Digital-AI-Employee`），推送 `v*` tag 即自动在 Windows/macOS/Linux 构建安装包、生成 SHA256 并发布到 Releases。工作流中 electron-builder 命令与产物路径需按源码仓库实际配置调整。

> 进阶：可用 GitHub Actions 在 Release 创建后自动同步最新版本信息到本站 `releases.json`，实现"打 tag → 官网自动更新"。

## 桌面应用自动更新

下载页已展示校验值；应用内静默升级需在源码仓库配置：

- **Electron + electron-builder**：配置 `publish` 指向 GitHub 仓库，发布时自动生成 `latest.yml`（工作流已包含），应用内用 `electron-updater` 检测更新。
- **代码签名**：Windows 用代码签名证书消除 SmartScreen 警告；macOS 用 Developer ID 公证（当前为自签名开发证书，见 HANDOFF.md）。

## 国内访问优化

Vercel 边缘节点在中国大陆不稳定，可选：

- **A（最简单）**：部署到 Cloudflare Pages / GitHub Pages。
- **B**：域名 DNS 放火山引擎/阿里云，用 [enhanced-FaaS-in-China](https://github.com/bestony/enhanced-FaaS-in-China) 的优选 CNAME 指向 Vercel。
- **C（商业场景）**：主体备案后，安装包放阿里云 OSS/腾讯云 COS + CDN，官网迁国内云。

## 常见问题

- **下载按钮为何自动识别系统？** `main.js` 读浏览器 UA 选择平台；macOS/Linux 无安装包时显示"即将推出"。
- **没有 GitHub 仓库？** 把 `releases.json` 的 `url` 换成 OSS/COS 直链即可，其余不变。
- **想要下载统计？** 用 GitHub API 统计 Release 资产下载量，或在前端点击事件上报。
- **场景区是纯 CSS 占位图**，上线前建议替换为 1号员工 的真实截图（放 `assets/img/`）。

---

License：模板可按任意许可使用（建议 MIT）。
