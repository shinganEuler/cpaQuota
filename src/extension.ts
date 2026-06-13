import { commands, ExtensionContext, workspace } from 'vscode';
import { CONFIG_NAMESPACE, getConfig, getRefreshInterval } from './config';
import { QuotaService } from './quotaService';
import { QuotaStatusBar } from './statusBar';

let timer: NodeJS.Timeout | null = null;
let refreshing = false;

export async function activate(context: ExtensionContext): Promise<void> {
  const service = new QuotaService();
  const statusBar = new QuotaStatusBar();

  const refresh = async () => {
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
      const snapshot = await service.fetchQuotaSnapshot();
      statusBar.update(snapshot);
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

  context.subscriptions.push(
    statusBar,
    commands.registerCommand('cpaQuota.refresh', refresh),
    commands.registerCommand('cpaQuota.showDetails', () => statusBar.showDetails()),
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(CONFIG_NAMESPACE)) {
        resetTimer();
        refresh();
      }
    })
  );

  await refresh();
  resetTimer();
}

export function deactivate(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
