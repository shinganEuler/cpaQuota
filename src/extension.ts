import { createHash } from 'crypto';
import { commands, ExtensionContext, workspace } from 'vscode';
import { CONFIG_NAMESPACE, getConfig, getManagementKey, getManagerBaseUrl, getRefreshInterval, getVisibleProviders } from './config';
import { QuotaService } from './quotaService';
import { SharedQuotaCache } from './sharedQuotaCache';
import { QuotaStatusBar } from './statusBar';

let timer: NodeJS.Timeout | null = null;
let cacheTimer: NodeJS.Timeout | null = null;
let refreshing = false;
const CACHE_POLL_INTERVAL_MS = 60_000;

export async function activate(context: ExtensionContext): Promise<void> {
  const service = new QuotaService();
  const statusBar = new QuotaStatusBar();
  const cache = () => new SharedQuotaCache(context.globalStorageUri.fsPath, getCacheKey());
  let displayedFetchedAt = 0;

  const refresh = async (force = false) => {
    if (refreshing) {
      return;
    }
    if (getConfig('hideStatusBar', false)) {
      statusBar.clear();
      return;
    }

    refreshing = true;
    statusBar.showLoading();
    try {
      const sharedCache = cache();
      const snapshot = force
        ? await sharedCache.refresh(() => service.fetchQuotaSnapshot())
        : await sharedCache.readFresh(getRefreshInterval())
          ?? await sharedCache.refresh(() => service.fetchQuotaSnapshot());
      statusBar.update(snapshot);
      displayedFetchedAt = snapshot.fetchedAt;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      statusBar.showError(`CPA 配额刷新失败：${message}`);
      console.error(`[cpaQuota] refresh failed: ${message}`);
    } finally {
      refreshing = false;
    }
  };

  const resetTimer = () => {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    if (!getConfig('hideStatusBar', false)) {
      timer = setInterval(refresh, getRefreshInterval());
    }
  };

  const resetCacheTimer = () => {
    if (cacheTimer) {
      clearInterval(cacheTimer);
      cacheTimer = null;
    }
    if (!getConfig('hideStatusBar', false)) {
      cacheTimer = setInterval(async () => {
        if (refreshing) {
          return;
        }
        const snapshot = await cache().readCurrent();
        if (snapshot && snapshot.fetchedAt > displayedFetchedAt) {
          statusBar.update(snapshot);
          displayedFetchedAt = snapshot.fetchedAt;
        }
      }, CACHE_POLL_INTERVAL_MS);
    }
  };

  context.subscriptions.push(
    statusBar,
    commands.registerCommand('cpaQuota.refresh', () => refresh(true)),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_NAMESPACE)) {
        resetTimer();
        resetCacheTimer();
        refresh();
      }
    })
  );

  await refresh();
  resetTimer();
  resetCacheTimer();
}

export function deactivate(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  if (cacheTimer) {
    clearInterval(cacheTimer);
    cacheTimer = null;
  }
}

function getCacheKey(): string {
  return JSON.stringify({
    baseUrl: getManagerBaseUrl(),
    managementKeyHash: createHash('sha256').update(getManagementKey()).digest('hex'),
    providers: getVisibleProviders()
  });
}
