import { MarkdownString, StatusBarAlignment, StatusBarItem, ThemeColor, window } from 'vscode';
import { getConfig } from './config';
import { getProviderLabel } from './quotaService';
import { ProviderQuotaSummary, QuotaSnapshot } from './types';
import { average, formatDateTime, formatPercent } from './utils';

const STATUS_PRIORITY = 10_000;

export class QuotaStatusBar {
  private item: StatusBarItem;
  private snapshot: QuotaSnapshot | null = null;

  constructor() {
    this.item = window.createStatusBarItem('cpaQuota.status', StatusBarAlignment.Right, STATUS_PRIORITY);
    this.item.command = 'cpaQuota.refresh';
  }

  update(snapshot: QuotaSnapshot): void {
    this.snapshot = snapshot;
    if (getConfig('hideStatusBar', false)) {
      this.clear();
      return;
    }

    const visibleSummaries = snapshot.summaries.filter((summary) => summary.accountCount > 0);
    if (!visibleSummaries.length) {
      this.item.text = '$(circle-slash) CPA 配额';
      this.item.tooltip = '未找到已启用的 Codex/Gemini/Claude auth file';
      this.item.color = new ThemeColor('disabledForeground');
      this.item.show();
      return;
    }

    this.item.text = this.formatTokenText(visibleSummaries);
    this.item.tooltip = this.buildTooltip(snapshot);
    this.item.color = undefined;
    this.item.show();
    console.info('[cpaQuota] status bar updated', {
      text: this.item.text,
      accountCount: visibleSummaries.reduce((sum, summary) => sum + summary.accountCount, 0),
      successfulAccountCount: visibleSummaries.reduce((sum, summary) => sum + summary.successfulAccountCount, 0)
    });
  }

  showLoading(): void {
    if (getConfig('hideStatusBar', false)) {
      this.clear();
      return;
    }
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
    this.item.text = '$(warning) CPA 配额';
    this.item.tooltip = message;
    this.item.color = new ThemeColor('statusBarItem.warningForeground');
    this.item.show();
  }

  clear(): void {
    this.item.hide();
  }

  dispose(): void {
    this.item.dispose();
  }

  private formatTokenText(summaries: ProviderQuotaSummary[]): string {
    const hour = average(summaries.map((summary) => summary.hourRemainingPercent));
    const week = average(summaries.map((summary) => summary.weekRemainingPercent));
    return `Token: ${formatPercent(hour)}/5h ${formatPercent(week)}/1w`;
  }

  private buildTooltip(snapshot: QuotaSnapshot): MarkdownString {
    const lines = [
      'CPA Token Quota',
      `Updated: ${new Date(snapshot.fetchedAt).toLocaleString()}`
    ];
    snapshot.summaries.forEach((summary) => {
      lines.push('', ...this.buildDetailLines(summary));
    });
    const tooltip = new MarkdownString();
    tooltip.appendCodeblock(lines.join('\n'), 'text');
    return tooltip;
  }

  private buildDetailLines(summary: ProviderQuotaSummary): string[] {
    const label = getProviderLabel(summary.provider);
    if (!summary.accountCount) {
      return [`${label}`, '  No accounts'];
    }

    const lines = [
      `${label} (${summary.successfulAccountCount}/${summary.accountCount})`,
      `  ${this.formatWindowLine('5h', summary.hourRemainingPercent, summary.nextHourResetAt)}`,
      `  ${this.formatWindowLine('1w', summary.weekRemainingPercent, summary.nextWeekResetAt)}`
    ];

    summary.accounts.forEach((account) => {
      const status = this.formatAccountStatus(account.disabled, account.unavailable);
      if (account.error) {
        lines.push(`  - ${account.name}${status}: ${account.error}`);
        return;
      }
      const week = account.windows.find((window) => /周|week|7d/i.test(window.label)) ?? account.windows[1];
      const hour = account.windows.find((window) => /小时|hour|5h/i.test(window.label)) ?? account.windows[0];
      lines.push(`  - ${account.name}${status}`);
      lines.push(`      ${this.formatWindowLine('5h', hour?.remainingPercent ?? null, hour?.resetAt ?? null)}`);
      lines.push(`      ${this.formatWindowLine('1w', week?.remainingPercent ?? null, week?.resetAt ?? null)}`);
    });

    return lines;
  }

  private formatAccountStatus(disabled?: boolean, unavailable?: boolean): string {
    const parts: string[] = [];
    if (disabled) {
      parts.push('disabled');
    }
    if (unavailable) {
      parts.push('unavailable');
    }
    return parts.length ? ` [${parts.join(', ')}]` : '';
  }

  private formatWindowLine(label: string, percent: number | null, resetAt: number | null): string {
    const percentText = formatPercent(percent).padStart(4, ' ');
    return `${label.padEnd(2, ' ')}  ${percentText}  reset ${this.formatReset(resetAt)}`;
  }

  private formatReset(timestamp: number | null): string {
    if (!timestamp) {
      return '--';
    }
    const diffMs = timestamp - Date.now();
    if (diffMs <= 0) {
      return formatDateTime(timestamp);
    }
    const totalMinutes = Math.ceil(diffMs / 60_000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor((totalMinutes % 1440) / 60);
    const minutes = totalMinutes % 60;
    if (days) {
      return `${days}d ${hours}h`;
    }
    if (hours) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes || 1}m`;
  }
}
