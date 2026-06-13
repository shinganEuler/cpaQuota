import { StatusBarAlignment, StatusBarItem, ThemeColor, window } from 'vscode';
import { getConfig } from './config';
import { getProviderLabel } from './quotaService';
import { ProviderQuotaSummary, QuotaSnapshot } from './types';
import { formatPercent, formatRelativeReset } from './utils';

const STATUS_PRIORITY = -10_000;
const REFRESH_PRIORITY = STATUS_PRIORITY + 1;

export class QuotaStatusBar {
  private item: StatusBarItem;
  private refreshItem: StatusBarItem;
  private snapshot: QuotaSnapshot | null = null;

  constructor() {
    this.refreshItem = window.createStatusBarItem(StatusBarAlignment.Left, REFRESH_PRIORITY);
    this.refreshItem.text = '$(refresh)';
    this.refreshItem.tooltip = '刷新 CPA 配额';
    this.refreshItem.command = 'cpaQuota.refresh';

    this.item = window.createStatusBarItem(StatusBarAlignment.Left, STATUS_PRIORITY);
    this.item.command = 'cpaQuota.showDetails';
  }

  update(snapshot: QuotaSnapshot): void {
    this.snapshot = snapshot;
    if (getConfig('hideStatusBar', false)) {
      this.clear();
      return;
    }

    this.showRefreshButton();
    const visibleSummaries = snapshot.summaries.filter((summary) => summary.accountCount > 0);
    if (!visibleSummaries.length) {
      this.item.text = '$(circle-slash) CPA 配额';
      this.item.tooltip = '未找到已启用的 Codex/Gemini/Claude auth file';
      this.item.color = new ThemeColor('disabledForeground');
      this.item.show();
      return;
    }

    this.item.text = visibleSummaries.map((summary) => this.formatSummaryText(summary)).join('  ');
    this.item.tooltip = this.buildTooltip(snapshot);
    this.item.color = undefined;
    this.item.show();
  }

  showLoading(): void {
    if (getConfig('hideStatusBar', false)) {
      this.clear();
      return;
    }
    this.showRefreshButton();
    this.item.text = '$(sync~spin) CPA 配额';
    this.item.tooltip = '正在刷新 Codex/Gemini/Claude 配额';
    this.item.color = undefined;
    this.item.show();
  }

  showError(message: string): void {
    if (getConfig('hideStatusBar', false)) {
      this.clear();
      return;
    }
    this.showRefreshButton();
    this.item.text = '$(warning) CPA 配额';
    this.item.tooltip = message;
    this.item.color = new ThemeColor('statusBarItem.warningForeground');
    this.item.show();
  }

  async showDetails(): Promise<void> {
    if (!this.snapshot) {
      window.showInformationMessage('CPA 配额尚未刷新。');
      return;
    }
    const lines = this.snapshot.summaries.flatMap((summary) => this.buildDetailLines(summary));
    await window.showInformationMessage(lines.join('\n'), { modal: true });
  }

  clear(): void {
    this.item.hide();
    this.refreshItem.hide();
  }

  dispose(): void {
    this.item.dispose();
    this.refreshItem.dispose();
  }

  private showRefreshButton(): void {
    this.refreshItem.show();
  }

  private formatSummaryText(summary: ProviderQuotaSummary): string {
    const label = getProviderLabel(summary.provider);
    const accountText = summary.accountCount > 1 ? `(${summary.successfulAccountCount}/${summary.accountCount})` : '';
    return `${label}${accountText} 周${formatPercent(summary.weekRemainingPercent)} 时${formatPercent(summary.hourRemainingPercent)}`;
  }

  private buildTooltip(snapshot: QuotaSnapshot): string {
    const lines = [
      'CPA 配额（剩余额度，多个账号取平均）',
      `更新时间：${new Date(snapshot.fetchedAt).toLocaleString()}`
    ];
    snapshot.summaries.forEach((summary) => {
      lines.push(...this.buildDetailLines(summary));
    });
    return lines.join('\n');
  }

  private buildDetailLines(summary: ProviderQuotaSummary): string[] {
    const label = getProviderLabel(summary.provider);
    if (!summary.accountCount) {
      return [`${label}: 未找到账号`];
    }

    const lines = [
      `${label}: 账号 ${summary.successfulAccountCount}/${summary.accountCount}，周 ${formatPercent(summary.weekRemainingPercent)}，小时 ${formatPercent(summary.hourRemainingPercent)}`,
      `  最近周配额重置：${formatRelativeReset(summary.nextWeekResetAt)}`,
      `  最近小时配额重置：${formatRelativeReset(summary.nextHourResetAt)}`
    ];

    summary.accounts.forEach((account) => {
      if (account.error) {
        lines.push(`  ${account.name}: ${account.error}`);
        return;
      }
      const week = account.windows.find((window) => /周|week|7d/i.test(window.label)) ?? account.windows[1];
      const hour = account.windows.find((window) => /小时|hour|5h/i.test(window.label)) ?? account.windows[0];
      lines.push(
        `  ${account.name}: 周 ${formatPercent(week?.remainingPercent ?? null)} ${formatRelativeReset(week?.resetAt ?? null)}；小时 ${formatPercent(hour?.remainingPercent ?? null)} ${formatRelativeReset(hour?.resetAt ?? null)}`
      );
    });

    return lines;
  }
}
