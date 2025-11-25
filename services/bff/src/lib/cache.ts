/**
 * Simple in-memory cache for BFF responses
 * Implements TTL-based expiration
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

export class SimpleCache {
  private cache: Map<string, CacheEntry<any>>;
  private defaultTTL: number;

  constructor(defaultTTL: number = 300) {
    this.cache = new Map();
    this.defaultTTL = defaultTTL * 1000; // Convert to milliseconds

    // Cleanup expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }

    return entry.data as T;
  }

  /**
   * Set value in cache with optional custom TTL
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const expiresAt = Date.now() + (ttl ? ttl * 1000 : this.defaultTTL);

    this.cache.set(key, {
      data,
      expiresAt,
    });
  }

  /**
   * Delete value from cache
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys()),
    };
  }

  /**
   * Generate cache key from request
   */
  static generateKey(method: string, url: string, params?: any): string {
    const paramStr = params ? JSON.stringify(params) : '';
    return `${method}:${url}:${paramStr}`;
  }
}
