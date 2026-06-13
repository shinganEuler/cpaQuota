import { CpaApiClient } from './apiClient';
import { getManagerBaseUrl, getVisibleProviders } from './config';
import {
  AccountQuota,
  AuthFileItem,
  ProviderId,
  ProviderQuotaSummary,
  QuotaSnapshot
} from './types';
import { average, formatDateTime, minTimestamp } from './utils';
import {
  buildRequestData,
  buildRequestHeaders,
  getAccountLabel,
  getAuthIndex,
  normalizeProvider,
  parseProviderQuota,
  PROVIDER_REQUESTS,
  selectHourWindow,
  selectWeekWindow
} from './quotaParsers';

export class QuotaService {
  async fetchQuotaSnapshot(): Promise<QuotaSnapshot> {
    const client = new CpaApiClient(getManagerBaseUrl());
    const visibleProviders = new Set(getVisibleProviders());
    const authFiles = await client.getAuthFiles();
    const files = (authFiles.files ?? []).filter((file) => {
      const provider = normalizeProvider(file);
      return provider && visibleProviders.has(provider) && file.disabled !== true && file.unavailable !== true;
    });

    const accountQuotas = await Promise.all(files.map((file) => this.fetchAccountQuota(client, file)));
    const summaries = getVisibleProviders().map((provider) =>
      this.buildProviderSummary(provider, accountQuotas.filter((account) => account.provider === provider))
    );

    return {
      summaries,
      fetchedAt: Date.now()
    };
  }

  private async fetchAccountQuota(client: CpaApiClient, file: AuthFileItem): Promise<AccountQuota> {
    const provider = normalizeProvider(file) as ProviderId;
    const authIndex = getAuthIndex(file);
    const name = getAccountLabel(file);

    if (!authIndex) {
      return {
        provider,
        name,
        authIndex: '',
        windows: [],
        error: 'authIndex 为空'
      };
    }

    try {
      const request = PROVIDER_REQUESTS[provider];
      const result = await client.apiCall({
        authIndex,
        method: request.method,
        url: request.url,
        header: buildRequestHeaders(provider, file),
        data: buildRequestData(provider, file)
      });

      if (result.statusCode < 200 || result.statusCode >= 300) {
        return {
          provider,
          name,
          authIndex,
          windows: [],
          error: `HTTP ${result.statusCode} ${result.bodyText}`.trim()
        };
      }

      const windows = parseProviderQuota(provider, result.body ?? result.bodyText);
      return {
        provider,
        name,
        authIndex,
        windows: windows.map((window) => ({
          ...window,
          resetLabel: formatDateTime(window.resetAt)
        }))
      };
    } catch (error) {
      return {
        provider,
        name,
        authIndex,
        windows: [],
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private buildProviderSummary(provider: ProviderId, accounts: AccountQuota[]): ProviderQuotaSummary {
    const successful = accounts.filter((account) => !account.error && account.windows.length);
    const hourWindows = successful.map(selectHourWindow);
    const weekWindows = successful.map(selectWeekWindow);

    return {
      provider,
      accounts,
      accountCount: accounts.length,
      successfulAccountCount: successful.length,
      weekRemainingPercent: average(weekWindows.map((window) => window?.remainingPercent ?? null)),
      hourRemainingPercent: average(hourWindows.map((window) => window?.remainingPercent ?? null)),
      nextWeekResetAt: minTimestamp(weekWindows.map((window) => window?.resetAt ?? null)),
      nextHourResetAt: minTimestamp(hourWindows.map((window) => window?.resetAt ?? null)),
      errorCount: accounts.length - successful.length,
      fetchedAt: Date.now()
    };
  }
}

export function getProviderLabel(provider: ProviderId): string {
  if (provider === 'codex') {
    return 'Codex';
  }
  if (provider === 'gemini') {
    return 'Gemini';
  }
  return 'Claude';
}
