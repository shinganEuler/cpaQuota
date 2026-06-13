import { workspace } from 'vscode';
import { ProviderId, ProviderVisibility } from './types';

export const CONFIG_NAMESPACE = 'cpaQuota';
export const PROVIDERS: ProviderId[] = ['codex', 'gemini', 'claude'];

const DEFAULT_VISIBILITY: ProviderVisibility = {
  codex: true,
  gemini: true,
  claude: true
};

export function getConfig<T>(key: string, defaultValue: T): T {
  return workspace.getConfiguration(CONFIG_NAMESPACE).get<T>(key, defaultValue);
}

export function getManagerBaseUrl(): string {
  return getConfig('managerBaseUrl', 'http://localhost:8317').replace(/\/+$/, '');
}

export function getManagementKey(): string {
  return getConfig('managementKey', '').trim();
}

export function getProviderVisibility(): ProviderVisibility {
  const raw = getConfig<Partial<ProviderVisibility>>('providerVisibility', DEFAULT_VISIBILITY);
  return {
    codex: raw?.codex !== false,
    gemini: raw?.gemini !== false,
    claude: raw?.claude !== false
  };
}

export function getVisibleProviders(): ProviderId[] {
  const visibility = getProviderVisibility();
  return PROVIDERS.filter((provider) => visibility[provider]);
}

export function getRefreshInterval(): number {
  return Math.max(60_000, Math.floor(getConfig('interval', 3_600_000)));
}
