import fs from 'node:fs/promises';
import path from 'node:path';
import type { CacheAdapter, EnrichmentOutput } from '../types.js';

export class MemoryCache implements CacheAdapter {
  private store = new Map<string, { value: EnrichmentOutput; expiresAt: number }>();

  async get(key: string): Promise<EnrichmentOutput | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: EnrichmentOutput, ttlSeconds = 30 * 24 * 3600): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }

  clear(): void {
    this.store.clear();
  }
}

export class FileCache implements CacheAdapter {
  constructor(private dir: string = '.enrichment-cache') {}

  private keyPath(key: string): string {
    return path.join(this.dir, `${key}.json`);
  }

  async get(key: string): Promise<EnrichmentOutput | null> {
    try {
      const raw = await fs.readFile(this.keyPath(key), 'utf8');
      const { value, expiresAt } = JSON.parse(raw);
      if (expiresAt < Date.now()) {
        await fs.unlink(this.keyPath(key)).catch(() => {});
        return null;
      }
      return value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: EnrichmentOutput, ttlSeconds = 30 * 24 * 3600): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const payload = JSON.stringify({ value, expiresAt: Date.now() + ttlSeconds * 1000 });
    await fs.writeFile(this.keyPath(key), payload, 'utf8');
  }

  async has(key: string): Promise<boolean> {
    return (await this.get(key)) !== null;
  }
}
