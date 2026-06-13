# CPA Quota Status Bar

在 VS Code 状态栏显示 CPA Manager Plus / CPA Management API 中 Codex、Gemini CLI、Claude Code 账号配额。

## 功能

- 启动 VS Code 后自动刷新状态栏配额。
- 设置里可选择显示 `codex`、`gemini`、`claude` 哪些厂商。
- 同一厂商有多个账号时汇总显示周配额和小时配额，汇总值按可用账号剩余额度取平均。
- 点击状态栏显示最近的周配额、小时配额重置时间，以及各账号明细。
- 定时拉取配额，默认 `3600000` 毫秒，也就是 1 小时一次。

## 配置

- `cpaQuota.managerBaseUrl`: CPA Manager Plus 或 CPA Management API 地址，默认 `http://localhost:8317`。
- `cpaQuota.managementKey`: admin key 或 CPA Management Key，会作为 `Authorization: Bearer ...` 发送。
- `cpaQuota.providerVisibility`: 厂商显示开关。
- `cpaQuota.interval`: 刷新间隔，默认 1 小时，最小 1 分钟。
- `cpaQuota.hideStatusBar`: 隐藏状态栏。

## 数据来源

插件读取 `/auth-files` 获取账号列表，再通过 `/api-call` 使用对应 `authIndex` 代理请求：

- Codex: `https://chatgpt.com/backend-api/wham/usage`
- Gemini CLI: `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- Claude Code: `https://api.anthropic.com/api/oauth/usage`

这些路径与 CPA Manager Plus 当前 quota 页面使用的调用方式保持一致。

## 开发

```bash
npm install
npm test
```
