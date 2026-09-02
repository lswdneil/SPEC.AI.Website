# 问题反馈云提交 — 部署交接清单 (2026-09-02)

> 背景: 2号员工桌面版"问题反馈"原为跳转 GitHub 网页手动提交 (国内不稳 + 两次接管体验差)。
> 已改为: PC 端提交 → 云端 API → 后端自动建 GitHub issue (用户零接管)。
> **代码已完成并 commit, 剩余 = 部署 + 配置凭据 + 端到端验证。**

## 涉及的仓库 (2 个)

| 仓库 | 路径 | 改动 |
|------|------|------|
| SPEC.AI.Website (云端) | `C:\Users\wd_al\Downloads\deepseek-harness-workspace\download\software-download-site` | `_worker.js` 新增 POST /api/feedback (commit f5f8931, 已提交) |
| Prime-agent-desktop (桌面) | `C:\Users\wd_al\Downloads\deepseek-harness-workspace\download\Prime-agent-desktop` | `desktop/src/components/FeedbackModal.tsx` 改云端提交 (commit 1e7a2006e, 已提交) |

## 待办事项 (按顺序)

### 1. 获取 Cloudflare API Token (部署用)
- 来源: Cloudflare 控制台 → My Profile → API Tokens (需 Pages:Edit 权限, account 418811a8d8a2571eab803093f07685e0)
- 用途: 部署 _worker.js 到 Pages 项目 `spec-ai-website`

### 2. 部署云端 worker
```bash
cd C:\Users\wd_al\Downloads\deepseek-harness-workspace\download\software-download-site
export CLOUDFLARE_API_TOKEN="<token>"   # 或写入 ~/.cloudflare/token (格式: CLOUDFLARE_API_TOKEN=xxx)
python scripts/deploy.py
```
- 验证: `curl https://spec-ai.cn/api/feedback -X POST` 应返回 401 (无 token) 而非 404

### 3. 生成 GitHub PAT 并配置 worker secret
- 用户生成: github.com → Settings → Developer settings → Personal access tokens (classic)
  - 必须含 scope: `repo` (issues 写权限), 建议有效期短 (30 天)
  - token 给部署 agent 时通过安全通道 (勿明文写入文档/代码)
- 配置为 Cloudflare Worker secret: Pages 项目 spec-ai-website → Settings → Variables and Secrets
  - key: `WORKERS_GH_TOKEN`, value: 上述 PAT
  - (worker 代码读取 env.WORKERS_GH_TOKEN, 缺失时 /api/feedback 返回 503 明确错误)

### 4. 端到端验证
- 桌面 dev (5175) 登录 dev_web@spec-ai.cn → 设置 → 关于 → 问题反馈 → 填表提交
  - 预期: 弹窗显示"已成功提交，感谢您的反馈。后台 spec.ai agent 会及时处理您的 issue 提交", **不跳浏览器**
- 检查 GitHub repo `lswdneil/Digital-AI-Employee` Issues 出现新 issue (title 格式 `[E2] [模块] 摘要`, labels: source:employee-2 + type:xxx)
- 异常路径: 未登录提交 → 401 提示; GitHub token 失效 → 502/503 提示原因

### 5. 打包 (可选, 验证通过后)
- 桌面端改动需重建 bundle 无关 (纯前端) — 下次 MSI 重建自动包含 (commit 1e7a2006e)

## API 契约 (POST https://spec-ai.cn/api/feedback)
请求头: `Authorization: Bearer <云侧JWT>`
```json
{ "module": "chat", "type": "bug", "summary": "标题(≤60)", "description": "详情(≤2000)", "version": "0.2.0", "userCode": "可选" }
```
成功: `{ "ok": true, "issueUrl": "https://github.com/..." }`
失败: 401 (未登录) / 400 (参数缺) / 429 (限流 1 分钟 1 条) / 502 (GitHub 失败) / 503 (GH_TOKEN 未配置)

## 代码位置速查
- 云端端点: `_worker.js` 搜 `api/feedback`
- 桌面提交: `desktop/src/components/FeedbackModal.tsx` handleSubmit
- 测试: `tests/worker-unit.js` (12 条 feedback 用例, 120 全通过)

## 未决
- Cloudflare API Token 位置 (原部署凭据未找到, 需用户提供)
- GitHub PAT 需用户生成 (repo scope)
