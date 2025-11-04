export interface CacheAdapter<T = unknown> {
  get(key: string): Promise<T | undefined>;
  set(key: string, value: T, ttlMs: number): Promise<void>;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class InMemoryCache<T = unknown> implements CacheAdapter<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  async get(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  async set(key: string, value: T, ttlMs: number): Promise<void> {
    const expiresAt = Date.now() + ttlMs;
    this.entries.set(key, { value, expiresAt });
  }
}
