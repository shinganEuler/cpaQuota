# CPA Quota Status Bar

Show Codex, Gemini CLI, and Claude Code quotas from CPA Manager Plus / CPA Management API in the VS Code status bar.

## Features

- Automatically refreshes quotas after VS Code starts.
- Lets you choose which providers to show: `codex`, `gemini`, and `claude`.
- Aggregates multiple accounts under the same provider and shows weekly and hourly remaining quota.
- Uses the average remaining quota across available accounts when aggregating a provider.
- Shows `Token: <hour>/5h <week>/1w` in the status bar.
- Shows provider and per-account reset details in the status bar tooltip.
- Refreshes when you click the status bar item.
- Refreshes on a timer. The default interval is `60` minutes.

## Configuration

- `cpaQuota.managerBaseUrl`: CPA Manager Plus or CPA Management API base URL. The default is `http://localhost:8317`.
- `cpaQuota.managementKey`: CPA Manager Plus admin key or CPA Management Key. It is sent as both `Authorization: Bearer ...` and `X-Management-Key` for compatibility.
- `cpaQuota.providerVisibility`: Provider visibility switches.
- `cpaQuota.interval`: Refresh interval in minutes. The default is `60`; the minimum is `1`.
- `cpaQuota.hideStatusBar`: Hide the status bar items.

## Data Source

The extension reads `/v0/management/auth-files` to discover accounts, then calls `/v0/management/api-call` with each account's `authIndex` to proxy quota requests:

- Codex: `https://chatgpt.com/backend-api/wham/usage`
- Gemini CLI: `https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota`
- Claude Code: `https://api.anthropic.com/api/oauth/usage`

These endpoints match the current CPA Manager Plus quota page behavior.

## Development

```bash
npm install
npm test
```
