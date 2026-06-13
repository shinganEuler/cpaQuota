import { AccountQuota, AuthFileItem, ProviderId, QuotaWindow } from './types';
import { clampPercent, normalizeNumber, normalizeString } from './utils';

const CODEX_USAGE_URL = 'https://chatgpt.com/backend-api/wham/usage';
const GEMINI_CLI_QUOTA_URL = 'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota';
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';

export const PROVIDER_REQUESTS: Record<ProviderId, { method: string; url: string; headers: Record<string, string>; data?: string }> = {
  codex: {
    method: 'GET',
    url: CODEX_USAGE_URL,
    headers: {
      Authorization: 'Bearer $TOKEN$',
      'Content-Type': 'application/json',
      'User-Agent': 'codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal'
    }
  },
  gemini: {
    method: 'POST',
    url: GEMINI_CLI_QUOTA_URL,
    headers: {
      Authorization: 'Bearer $TOKEN$',
      'Content-Type': 'application/json'
    }
  },
  claude: {
    method: 'GET',
    url: CLAUDE_USAGE_URL,
    headers: {
      Authorization: 'Bearer $TOKEN$',
      'Content-Type': 'application/json',
      'anthropic-beta': 'oauth-2025-04-20'
    }
  }
};

export function normalizeProvider(file: AuthFileItem): ProviderId | null {
  const candidates = [
    file.type,
    file.provider,
    file.service,
    file.kind,
    file.source,
    file.name,
    file.path,
    file.fileName,
    file.filename
  ];

  for (const candidate of candidates) {
    const raw = normalizeString(candidate);
    if (!raw) {
      continue;
    }
    const normalized = raw.toLowerCase();
    if (normalized === 'codex' || /(^|[^a-z])codex([^a-z]|$)/.test(normalized)) {
      return 'codex';
    }
    if (
      normalized === 'gemini-cli' ||
      normalized === 'gemini' ||
      /(^|[^a-z])gemini([^a-z]|$)/.test(normalized)
    ) {
      return 'gemini';
    }
    if (normalized === 'claude' || /(^|[^a-z])claude([^a-z]|$)/.test(normalized)) {
      return 'claude';
    }
  }
  return null;
}

export function getAuthIndex(file: AuthFileItem): string | null {
  return normalizeString(file.authIndex ?? file.auth_index ?? file['auth-index'] ?? file.index);
}

export function getAccountLabel(file: AuthFileItem): string {
  return normalizeString(file.name) ?? getAuthIndex(file) ?? 'unknown';
}

export function buildRequestData(provider: ProviderId, file: AuthFileItem): string | undefined {
  if (provider !== 'gemini') {
    return undefined;
  }
  const project = resolveGeminiProjectId(file);
  return JSON.stringify(project ? { project } : {});
}

export function buildRequestHeaders(provider: ProviderId, file: AuthFileItem): Record<string, string> {
  const headers = { ...PROVIDER_REQUESTS[provider].headers };
  if (provider === 'codex') {
    const accountId = resolveCodexAccountId(file);
    if (accountId) {
      headers['Chatgpt-Account-Id'] = accountId;
    }
  }
  return headers;
}

export function parseProviderQuota(provider: ProviderId, payload: unknown): QuotaWindow[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }
  const record = payload as Record<string, unknown>;
  if (provider === 'codex') {
    return parseCodexWindows(record);
  }
  if (provider === 'gemini') {
    return parseGeminiWindows(record);
  }
  return parseClaudeWindows(record);
}

function parseCodexWindows(payload: Record<string, unknown>): QuotaWindow[] {
  const windows: QuotaWindow[] = [];
  const addLimit = (prefix: string, limit: unknown) => {
    if (!limit || typeof limit !== 'object') {
      return;
    }
    const limitRecord = limit as Record<string, unknown>;
    addCodexWindow(windows, `${prefix}-hour`, '小时', limitRecord.primary_window ?? limitRecord.primaryWindow);
    addCodexWindow(windows, `${prefix}-week`, '周', limitRecord.secondary_window ?? limitRecord.secondaryWindow);
  };

  addLimit('codex', payload.rate_limit ?? payload.rateLimit);
  addLimit('code-review', payload.code_review_rate_limit ?? payload.codeReviewRateLimit);

  const additional = payload.additional_rate_limits ?? payload.additionalRateLimits;
  if (Array.isArray(additional)) {
    additional.forEach((entry, index) => {
      if (!entry || typeof entry !== 'object') {
        return;
      }
      const item = entry as Record<string, unknown>;
      const name = normalizeString(item.limit_name ?? item.limitName ?? item.metered_feature ?? item.meteredFeature) ?? `附加 ${index + 1}`;
      addLimit(name, item.rate_limit ?? item.rateLimit);
    });
  }
  return windows;
}

function addCodexWindow(windows: QuotaWindow[], id: string, fallbackLabel: string, window: unknown): void {
  if (!window || typeof window !== 'object') {
    return;
  }
  const record = window as Record<string, unknown>;
  const used = normalizeNumber(record.used_percent ?? record.usedPercent);
  const seconds = normalizeNumber(record.limit_window_seconds ?? record.limitWindowSeconds);
  const label = seconds ? labelForSeconds(seconds, fallbackLabel) : fallbackLabel;
  windows.push({
    id,
    label,
    remainingPercent: used === null ? null : clampPercent(100 - used),
    resetAt: resolveResetAt(record),
    resetLabel: '',
    windowSeconds: seconds
  });
}

function parseGeminiWindows(payload: Record<string, unknown>): QuotaWindow[] {
  const buckets = Array.isArray(payload.buckets) ? payload.buckets : [];
  return buckets
    .map((bucket, index): QuotaWindow | null => {
      if (!bucket || typeof bucket !== 'object') {
        return null;
      }
      const record = bucket as Record<string, unknown>;
      const model = normalizeString(record.modelId ?? record.model_id) ?? `bucket-${index + 1}`;
      const remainingFraction = normalizeNumber(record.remainingFraction ?? record.remaining_fraction);
      const remainingAmount = normalizeNumber(record.remainingAmount ?? record.remaining_amount);
      const reset = normalizeString(record.resetTime ?? record.reset_time);
      const resetAt = reset ? Date.parse(reset) : NaN;
      return {
        id: model,
        label: model,
        remainingPercent: remainingFraction !== null
          ? clampPercent(remainingFraction <= 1 ? remainingFraction * 100 : remainingFraction)
          : remainingAmount !== null && remainingAmount <= 0
          ? 0
          : null,
        resetAt: Number.isNaN(resetAt) ? null : resetAt,
        resetLabel: '',
        windowSeconds: null
      };
    })
    .filter((window): window is QuotaWindow => Boolean(window));
}

function parseClaudeWindows(payload: Record<string, unknown>): QuotaWindow[] {
  const keys = [
    ['five_hour', '小时'],
    ['seven_day', '周'],
    ['seven_day_oauth_apps', '周 OAuth Apps'],
    ['seven_day_opus', '周 Opus'],
    ['seven_day_sonnet', '周 Sonnet'],
    ['seven_day_cowork', '周 Cowork'],
    ['iguana_necktie', '周']
  ] as const;

  return keys
    .map(([key, label]): QuotaWindow | null => {
      const value = payload[key];
      if (!value || typeof value !== 'object') {
        return null;
      }
      const record = value as Record<string, unknown>;
      const utilization = normalizeNumber(record.utilization);
      const reset = normalizeString(record.resets_at);
      const resetAt = reset ? Date.parse(reset) : NaN;
      return {
        id: key,
        label,
        remainingPercent: utilization === null ? null : clampPercent(100 - utilization),
        resetAt: Number.isNaN(resetAt) ? null : resetAt,
        resetLabel: '',
        windowSeconds: key === 'five_hour' ? 18_000 : 604_800
      };
    })
    .filter((window): window is QuotaWindow => Boolean(window));
}

export function selectHourWindow(account: AccountQuota): QuotaWindow | null {
  return selectWindow(account.windows, 'hour');
}

export function selectWeekWindow(account: AccountQuota): QuotaWindow | null {
  return selectWindow(account.windows, 'week');
}

function selectWindow(windows: QuotaWindow[], kind: 'hour' | 'week'): QuotaWindow | null {
  const expected = kind === 'hour' ? 18_000 : 604_800;
  const bySeconds = windows.find((window) => window.windowSeconds === expected);
  if (bySeconds) {
    return bySeconds;
  }
  const byLabel = windows.find((window) => kind === 'hour' ? /小时|hour|5h/i.test(window.label) : /周|week|7d/i.test(window.label));
  if (byLabel) {
    return byLabel;
  }
  return kind === 'hour' ? windows[0] ?? null : windows[1] ?? windows[0] ?? null;
}

function labelForSeconds(seconds: number, fallback: string): string {
  if (seconds === 18_000) {
    return '小时';
  }
  if (seconds === 604_800) {
    return '周';
  }
  if (seconds % 86_400 === 0) {
    return `${seconds / 86_400}天`;
  }
  if (seconds % 3600 === 0) {
    return `${seconds / 3600}小时`;
  }
  return fallback;
}

function resolveResetAt(record: Record<string, unknown>): number | null {
  const resetAt = normalizeNumber(record.reset_at ?? record.resetAt);
  if (resetAt !== null) {
    return resetAt < 1e12 ? resetAt * 1000 : resetAt;
  }
  const resetAfterSeconds = normalizeNumber(record.reset_after_seconds ?? record.resetAfterSeconds);
  if (resetAfterSeconds !== null) {
    return Date.now() + resetAfterSeconds * 1000;
  }
  return null;
}

function resolveCodexAccountId(file: AuthFileItem): string | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const candidates = [
    file.chatgpt_account_id,
    file.chatgptAccountId,
    file.account_id,
    file.accountId,
    metadata?.chatgpt_account_id,
    metadata?.chatgptAccountId,
    metadata?.account_id,
    metadata?.accountId,
    attributes?.chatgpt_account_id,
    attributes?.chatgptAccountId,
    attributes?.account_id,
    attributes?.accountId
  ];
  for (const candidate of candidates) {
    const value = normalizeString(candidate);
    if (value) {
      return value;
    }
  }
  return null;
}

function resolveGeminiProjectId(file: AuthFileItem): string | null {
  const metadata = asRecord(file.metadata);
  const attributes = asRecord(file.attributes);
  const direct = normalizeString(file.project_id ?? file.projectId ?? metadata?.project_id ?? metadata?.projectId ?? attributes?.project_id ?? attributes?.projectId);
  if (direct) {
    return direct;
  }
  const account = normalizeString(file.account ?? metadata?.account ?? attributes?.account);
  if (!account) {
    return null;
  }
  const matches = Array.from(account.matchAll(/\(([^()]+)\)/g));
  return matches[matches.length - 1]?.[1]?.trim() || null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
