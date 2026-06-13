export type ProviderId = 'codex' | 'gemini' | 'claude';

export type ProviderVisibility = Record<ProviderId, boolean>;

export interface AuthFileItem {
  name: string;
  type?: string;
  provider?: string;
  authIndex?: string | number | null;
  auth_index?: string | number | null;
  disabled?: boolean;
  unavailable?: boolean;
  account?: unknown;
  accountId?: unknown;
  account_id?: unknown;
  chatgptAccountId?: unknown;
  chatgpt_account_id?: unknown;
  id_token?: unknown;
  metadata?: unknown;
  attributes?: unknown;
  [key: string]: unknown;
}

export interface AuthFilesResponse {
  files?: AuthFileItem[];
  total?: number;
}

export interface ApiCallRequest {
  authIndex?: string;
  method: string;
  url: string;
  header?: Record<string, string>;
  data?: string;
}

export interface ApiCallResult {
  statusCode: number;
  bodyText: string;
  body: unknown | null;
}

export interface QuotaWindow {
  id: string;
  label: string;
  remainingPercent: number | null;
  resetAt: number | null;
  resetLabel: string;
  windowSeconds: number | null;
}

export interface AccountQuota {
  provider: ProviderId;
  name: string;
  authIndex: string;
  windows: QuotaWindow[];
  error?: string;
}

export interface ProviderQuotaSummary {
  provider: ProviderId;
  accounts: AccountQuota[];
  accountCount: number;
  successfulAccountCount: number;
  weekRemainingPercent: number | null;
  hourRemainingPercent: number | null;
  nextWeekResetAt: number | null;
  nextHourResetAt: number | null;
  errorCount: number;
  fetchedAt: number;
}

export interface QuotaSnapshot {
  summaries: ProviderQuotaSummary[];
  fetchedAt: number;
}
