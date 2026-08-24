# 部署手册与排障记录（DEPLOY-RUNBOOK）

> 本文档记录 1号员工 官网（spec-ai.cn）的部署方式与 2026-08-24 上线过程中踩过的坑与解法。
> 目的：后续碰到类似问题可直接按本手册应对，不重复排查。

## 1. 当前部署架构（2026-08-24 起）

- **平台**：Cloudflare Pages，项目名 **`spec-ai-website-git`**（Git 集成，非 Direct Upload）
- **代码仓库**：GitHub `lswdneil/SPEC.AI.Website`（main 分支）
- **部署方式**：**push 到 main → Cloudflare 自动构建部署**（无构建命令，输出目录 = 仓库根）
- **自定义域名**：`spec-ai.cn` + `www.spec-ai.cn`（CNAME → spec-ai-website-git.pages.dev）
- **后端**：`_worker.js` 高级模式（advanced worker）+ D1 绑定 `DB`；环境变量 `JWT_SECRET`（secret）、`DEV_MODE=0`
- **排除文件**：`.assetsignore`（内部文档 docs/*.md/scripts/tests 等不上传，防公开泄露）

## 2. 日常部署流程

```bash
# 改代码 → 本地验证（语法/渲染）→ 提交 → 推送
git add -A && git commit -m "..." && git push origin main
# Cloudflare 自动构建部署（约 1 分钟），无需本地脚本
# 验证：https://spec-ai.cn 与 https://spec-ai-website-git.pages.dev
```

发版流程（新安装包）：打 tag 发 GitHub Release → 更新 `data/releases.json`（URL/SHA256/版本）→ push（自动部署）→ 同步 `index.html` 的 JSON-LD 版本号。

## 3. 排障手册（本次上线的完整经验）

### 3.1 症状：部署显示成功，但所有 URL 返回 404（2026-07 起 Cloudflare Direct Upload 平台 bug）

**现象**：`deploy.py`（Direct Upload API）每次都返回 `DEPLOYED`，dashboard 有部署记录，但：
- 部署子 URL（`<id>.spec-ai-website.pages.dev`）也 404
- 纯静态最小项目（无 worker）同样 404 → 排除配置问题
- 独立 Worker 也无法创建激活（列表为空、子域 000）→ 账号级故障表象
- API 详情显示部署 **卡死在 `queued` 阶段**（`deploy` stage `started_on=null` 却标记 success）

**根因**：Cloudflare **Direct Upload 部署路径的平台 bug**（2026 年 7 月中旬起，多起相同案例，社区证实）。与项目配置、账号新旧、worker 模式无关。

**解法（已验证）**：改用 **Git 集成部署**——
1. Cloudflare API 创建 Git 集成项目（或 dashboard：Workers & Pages → Create → Import Git repository）
2. 配置环境变量 + D1 绑定
3. 连接后手动触发部署（POST deployments）或 push 自动触发
4. Git 集成部署 5 个 stage（queued/initialize/clone_repo/build/deploy）全部真实完成 → serving 正常

**诊断要点**（下次先做这几步）：
```bash
# 1. 查部署 stages（看是否卡 queued）
GET /accounts/{ACC}/pages/projects/{PROJ}/deployments?per_page=1
# 2. 查账号 worker 脚本数
GET /accounts/{ACC}/workers/scripts
# 3. 纯静态探测：部署一个无 worker 的最小项目，验证是否同样 404
# 4. 独立 worker 探测：创建 spec-probe-xxx 试 workers.dev 子域
```

### 3.2 API 操作经验（本次实测要点）

| 事项 | 要点 |
|---|---|
| curl 传 JSON | **PowerShell 里 `--data '...'` 引号会被吞导致 8000006**——务必写临时文件 + `--data-binary "@file"` |
| 创建 Git 项目 body | `source.type` 在 **source 层级**（`"source":{"type":"github","config":{...}}`），config 里 `repo_id`（GitHub 仓库数字 ID）必填 |
| Direct Upload 项目改 source | 报 `8000069 You cannot update the source object in a Direct Uploads project`——需新建 Git 项目，不能改旧项目 |
| 域名绑定 | `POST /pages/projects/{PROJ}/domains`（body `{"name":"spec-ai.cn"}`）；**同一域名不能同时绑两个项目**，需先从旧项目 DELETE 释放 |
| DNS 记录 | Pages 域名验证报 `CNAME record not set` → 需在 zone 建 CNAME（或 dashboard 点"激活"自动创建）；**注意 Pages token 通常无 zone 写权限**（报 10000），DNS 操作需 dashboard 或 zone token |
| 环境变量/secret | PATCH 项目 `deployment_configs.production.env_vars`；secret 值只在写入时可见，读不回明文——迁移时生成新值 |
| 自定义域名迁移 | 旧项目保留无害，但域名绑定要释放给新项目；DNS 指向新项目后 spec-ai.cn 立即生效（证书几分钟） |

### 3.3 安全教训：Git 集成会公开整个仓库

**现象**：Git 集成（无构建命令、输出目录=根）把仓库**所有文件**部署上线——`APP-API.md`、`README.md`、`docs/` 需求文档全部可公开访问（HTTP 200）。

**修复**：仓库根创建 **`.assetsignore`**（语法同 .gitignore），排除 `docs/`、`scripts/`、`tests/`、`.github/`、`*.md`、`LICENSE` 等内部文件。**上线后必须抽查**：`curl https://spec-ai.cn/README.md` 应为 404。

### 3.4 上线后验证清单

```bash
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/              # 200 首页
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/api/stats     # 401 JSON（worker 正常）
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/assets/css/style.css  # 200 静态
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/README.md     # 404（.assetsignore 生效）
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/docs/...      # 404（内部文档不公开）
```

## 4. 相关链接

- Cloudflare 社区案例：[Pages deployment shows Success but every URL returns 404](https://community.cloudflare.com/t/pages-deployment-shows-success-but-every-url-returns-404/942377)、[New account — all Pages deployments return HTTP 404](https://community.cloudflare.com/t/new-account-all-pages-deployments-return-http-404-at-pages-dev-for-24-hours/941361)
- 官方状态页：[Workers and Pages issue](https://www.cloudflarestatus.com/incidents/6spkrjtwhmpp)、[Pages users may be experiencing issues](https://www.cloudflarestatus.com/incidents/cpx9ctxd9nt2)
- 迁移评估（备用方案，已判定无需执行）：`site-preview/deploy-migration-assessment.md`（工作区）
