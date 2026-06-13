export function normalizeString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number(trimmed.endsWith('%') ? trimmed.slice(0, -1) : trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function formatPercent(value: number | null): string {
  if (value === null) {
    return '--';
  }
  const rounded = Math.round(value);
  return `${rounded}%`;
}

export function formatDateTime(timestamp: number | null): string {
  if (!timestamp) {
    return '接口未返回';
  }
  return new Date(timestamp).toLocaleString();
}

export function formatRelativeReset(timestamp: number | null): string {
  if (!timestamp) {
    return '接口未返回';
  }
  const diffMs = timestamp - Date.now();
  if (diffMs <= 0) {
    return formatDateTime(timestamp);
  }
  const totalMinutes = Math.ceil(diffMs / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days) {
    parts.push(`${days}天`);
  }
  if (hours) {
    parts.push(`${hours}小时`);
  }
  if (!days && minutes) {
    parts.push(`${minutes}分钟`);
  }
  return `${formatDateTime(timestamp)}（约 ${parts.join('') || '1分钟'} 后）`;
}

export function average(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null);
  if (!numeric.length) {
    return null;
  }
  return numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
}

export function minTimestamp(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => value !== null && value > Date.now());
  if (!numeric.length) {
    return null;
  }
  return Math.min(...numeric);
}

export function safeJsonParse(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
