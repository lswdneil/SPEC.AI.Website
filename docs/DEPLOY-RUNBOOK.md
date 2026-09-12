# 部署手册与排障记录（DEPLOY-RUNBOOK）

> 本文档记录 1号员工 官网（spec-ai.cn）的部署方式与 2026-08-24 上线过程中踩过的坑与解法。
> 目的：后续碰到类似问题可直接按本手册应对，不重复排查。

## 1. 当前部署架构（2026-08-24 起）

- **平台**：Cloudflare Pages，项目名 **`spec-ai-website-git`**（Git 集成，非 Direct Upload）
- **代码仓库**：GitHub `lswdneil/SPEC.AI.Website`（main 分支）
- **部署方式**：**push 到 main → Cloudflare 自动构建部署**（构建命令 `mkdir -p dist && tar --exclude=... -c . | tar -x -C dist`，输出目录 `dist`——只部署线上需要的文件）
- **自定义域名**：`spec-ai.cn` + `www.spec-ai.cn`（CNAME → spec-ai-website-git.pages.dev）
- **后端**：`_worker.js` 高级模式（advanced worker）+ D1 绑定 `DB`；环境变量 `JWT_SECRET`（secret）、`DEV_MODE=0`
- **排除文件**：构建命令用 tar `--exclude` 排除 `docs/`、`*.md`、`scripts/`、`tests/`、`.github/` 等内部文件（防公开泄露）

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
| 环境变量/secret | 🔴 **红线（2026-09-03 事故根因）**：**禁止 PATCH 整个 `deployment_configs.production.env_vars` 映射**——既有 secret 读不回明文，重发即被写成空值。改**单个** secret 只能用 `npx wrangler pages secret put <NAME> --project-name spec-ai-website-git`。详见 **§3.5** |
| 自定义域名迁移 | 旧项目保留无害，但域名绑定要释放给新项目；DNS 指向新项目后 spec-ai.cn 立即生效（证书几分钟） |

### 3.3 安全教训：Git 集成会公开整个仓库；`.assetsignore` 无效

**现象**：Git 集成（无构建命令、输出目录=根）把仓库**所有文件**部署上线——`APP-API.md`、`README.md`、`docs/` 需求文档全部可公开访问（HTTP 200）。

**踩坑**：`.assetsignore` 对 **Git 集成部署无效**（实测不生效；Cloudflare Pages 无内置排除机制，社区亦确认）。正确方案是**构建命令 + 输出目录**：

```
构建命令：mkdir -p dist && tar --exclude='.git' --exclude='docs' --exclude='scripts' --exclude='tests' --exclude='.github' --exclude='*.md' --exclude='dist' --exclude='LICENSE' --exclude='vercel.json' --exclude='package.json' --exclude='package-lock.json' -c . | tar -x -C dist
输出目录：dist
```

**缓存残留**：已公开过的文件即使新部署排除，仍有两层残留需要区分：
1. **CDN 边缘缓存**——`Purge Everything`（Zone → Caching → Configuration → 清除所有内容）可清除；清除后用 cache-busting 验证（`curl "https://spec-ai.cn/README.md?x=$RANDOM"` 应 404，无参直访可能仍 200）
2. **Pages 资产保留缓存**——保留已删除资产副本，**最长一周自然过期、无法手动清除**（实测 Purge 后 README.md/APP-API.md 仍 200，BRAND-SPEC.md 已 404）；**教训：任何内部/敏感文件一旦误部署，视为可能已公开一周，必要时轮换相关凭据**

**验证**（用 cache-busting 绕过边缘缓存确认真实状态）：
```bash
curl "https://spec-ai.cn/README.md?x=$RANDOM"   # 应 404（源站已排除）
curl "https://spec-ai.cn/?x=$RANDOM"             # 应 200
```

### 3.4 上线后验证清单

```bash
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/              # 200 首页
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/api/stats     # 401 JSON（worker 正常）
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/assets/css/style.css  # 200 静态
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/README.md     # 404（.assetsignore 生效）
curl -o /dev/null -w "%{http_code}" https://spec-ai.cn/docs/...      # 404（内部文档不公开）
```

### 3.5 🔴 环境变量 / secret 变更红线（违反必事故）

> **2026-09-03 实际事故**：为新增 `WORKERS_GH_TOKEN`，用一次 PATCH 重发了整个
> `deployment_configs.production.env_vars` 映射。既有 secret 的值读不回明文，只能以"无值条目"回传
> → **`RESEND_API_KEY` / `ALIYUN_AK_ID` / `ALIYUN_AK_SECRET` 被存成空字符串**。
> 结果：验证码**只写 D1、从不投递**，且两端客户端都只看 `ok` 不看 `delivered` → **静默失效 9.5 天**
> （09-02 最后一次成功 → 09-13 才发现）。完整复盘：
> `release-artifacts/AUTH-CODE-DELIVERY-INCIDENT-2026-09-13.md`。

| # | 红线 | 说明 |
|---|---|---|
| R1 | **永不重发整个 `deployment_configs.production.env_vars` 映射** | secret 无值回传 → 重发即清空。本起事故的根因 |
| R2 | 改单个 secret 只用 wrangler 单键写入（§3.5.1），或用 Dashboard 单行编辑 | 只改那一个 key，绝不触碰其它值 |
| R3 | 生产密钥必须在**密码管理器留备份** | 值读不回明文，丢了只能重新生成 |
| R4 | env/secret 改动**必须重新部署**才生效；改前/改后**各跑一次发码探针** | 空提交 push 即可触发；探针见 §3.5.2 |
| R6 | **Cloudflare 审计日志不记录 Pages env 变更** → 出事无法追溯 | 只能靠：变更留档 + 探针巡检 + 值备份 |
| R11 | 临时诊断路由（`/api/auth/diag`）用完应移除；保留则必须挂登录鉴权且**只回布尔/长度，绝不回值** | 现状：已上线且需登录 |
| R12 | 改 `_worker.js` 后必须跑 `node tests/run-tests.js`（CI 等价门禁，13 项） | 且 `sendCode` 任何失败路径**不能提前 return**（会吞 `DEV_MODE=1` 的 `devCode` 兜底 → CI 红 11 项） |

#### 3.5.1 改单个 secret（唯一安全方式）

```bash
npx wrangler pages secret put RESEND_API_KEY --project-name spec-ai-website-git
# 交互式粘贴值（不要把值写进 shell 历史/命令日志）
git commit --allow-empty -m "chore(deploy): apply updated secret" && git push origin main   # 重新部署才生效
```

#### 3.5.2 发码探针（改 env 前后各跑一次）

```bash
curl -s -X POST https://spec-ai.cn/api/auth/send-code -H "Content-Type: application/json" \
  -d '{"target":"<测试邮箱>","purpose":"register"}'
# 期望 {"ok":true,"delivered":true}
# 失败: {"ok":true,"delivered":false,"reason":"no_resend_key"|"no_aliyun_key"|"resend_http_<code>"|"resend_throw"|"aliyun_<code>"}
# 频控 5 次/小时/目标（429 too_many_requests）→ 自测换目标或等窗口
```

⚠️ 测试勿用 `+` 后缀地址（如 `user+tag@163.com`）——163 可能不落地（实测 `delivered:true` 但信箱无此件）。
⚠️ 勿用 urllib 直连 spec-ai.cn（会被 Cloudflare `error code: 1010` 拦），用浏览器或 curl。

## 4. 相关链接

- Cloudflare 社区案例：[Pages deployment shows Success but every URL returns 404](https://community.cloudflare.com/t/pages-deployment-shows-success-but-every-url-returns-404/942377)、[New account — all Pages deployments return HTTP 404](https://community.cloudflare.com/t/new-account-all-pages-deployments-return-http-404-at-pages-dev-for-24-hours/941361)
- 官方状态页：[Workers and Pages issue](https://www.cloudflarestatus.com/incidents/6spkrjtwhmpp)、[Pages users may be experiencing issues](https://www.cloudflarestatus.com/incidents/cpx9ctxd9nt2)
- 迁移评估（备用方案，已判定无需执行）：`site-preview/deploy-migration-assessment.md`（工作区）
