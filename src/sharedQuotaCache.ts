import * as fs from 'fs/promises';
import * as path from 'path';
import { QuotaSnapshot } from './types';

const CACHE_FILE = 'quota-snapshot.json';
const LOCK_DIR = 'quota-refresh.lock';
const LOCK_STALE_MS = 120_000;
const LOCK_WAIT_MS = 90_000;
const POLL_MS = 500;

interface CacheFile {
  key: string;
  snapshot: QuotaSnapshot;
  writtenAt: number;
}

export class SharedQuotaCache {
  private readonly cachePath: string;
  private readonly lockPath: string;

  constructor(private readonly directory: string, private readonly cacheKey: string) {
    this.cachePath = path.join(directory, CACHE_FILE);
    this.lockPath = path.join(directory, LOCK_DIR);
  }

  async readFresh(maxAgeMs: number): Promise<QuotaSnapshot | null> {
    const cached = await this.readCache();
    if (!cached || cached.key !== this.cacheKey) {
      return null;
    }
    return Date.now() - cached.writtenAt <= maxAgeMs ? cached.snapshot : null;
  }

  async readCurrent(): Promise<QuotaSnapshot | null> {
    const cached = await this.readCache();
    return cached?.key === this.cacheKey ? cached.snapshot : null;
  }

  async refresh(fetchSnapshot: () => Promise<QuotaSnapshot>): Promise<QuotaSnapshot> {
    await fs.mkdir(this.directory, { recursive: true });
    const start = Date.now();

    if (await this.tryAcquireLock()) {
      try {
        const snapshot = await fetchSnapshot();
        await this.writeCache(snapshot);
        return snapshot;
      } finally {
        await this.releaseLock();
      }
    }

    const previous = await this.readCache();
    while (Date.now() - start < LOCK_WAIT_MS) {
      await sleep(POLL_MS);
      const cached = await this.readCache();
      if (!cached || cached.key !== this.cacheKey) {
        continue;
      }
      if (!previous || cached.writtenAt > previous.writtenAt) {
        return cached.snapshot;
      }
    }

    const cached = await this.readCache();
    if (cached?.key === this.cacheKey) {
      return cached.snapshot;
    }
    throw new Error('Timed out waiting for shared quota refresh');
  }

  private async readCache(): Promise<CacheFile | null> {
    try {
      const text = await fs.readFile(this.cachePath, 'utf8');
      const parsed = JSON.parse(text) as Partial<CacheFile>;
      return parsed.key && parsed.snapshot && parsed.writtenAt
        ? (parsed as CacheFile)
        : null;
    } catch {
      return null;
    }
  }

  private async writeCache(snapshot: QuotaSnapshot): Promise<void> {
    const tempPath = `${this.cachePath}.${process.pid}.${Date.now()}.tmp`;
    const payload: CacheFile = {
      key: this.cacheKey,
      snapshot,
      writtenAt: Date.now()
    };
    await fs.writeFile(tempPath, JSON.stringify(payload), 'utf8');
    await fs.rename(tempPath, this.cachePath);
  }

  private async tryAcquireLock(): Promise<boolean> {
    try {
      await fs.mkdir(this.lockPath);
      await fs.writeFile(path.join(this.lockPath, 'owner.json'), JSON.stringify({
        pid: process.pid,
        createdAt: Date.now()
      }), 'utf8');
      return true;
    } catch {
      await this.removeStaleLock();
      try {
        await fs.mkdir(this.lockPath);
        return true;
      } catch {
        return false;
      }
    }
  }

  private async removeStaleLock(): Promise<void> {
    try {
      const stat = await fs.stat(this.lockPath);
      if (Date.now() - stat.mtimeMs > LOCK_STALE_MS) {
        await fs.rm(this.lockPath, { recursive: true, force: true });
      }
    } catch {
      return;
    }
  }

  private async releaseLock(): Promise<void> {
    await fs.rm(this.lockPath, { recursive: true, force: true });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
