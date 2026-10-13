export type RateLimitState = { allowed: boolean; retryAfterSec: number };

export type RateLimiter = {
  check(key: string): RateLimitState;
  hit(key: string): void;
  /** Removes the most recent hit of a key, e.g. to give back a hit that turned out not to count. */
  release(key: string): void;
  reset(key: string): void;
  clear(): void;
};

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  now?: () => number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const hits = new Map<string, number[]>();

  function recent(key: string): number[] {
    const cutoff = now() - options.windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  return {
    check(key) {
      const list = recent(key);
      if (list.length < options.max) return { allowed: true, retryAfterSec: 0 };
      const retryAt = list[list.length - options.max] + options.windowMs;
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((retryAt - now()) / 1000)) };
    },
    hit(key) {
      const list = recent(key);
      list.push(now());
      hits.set(key, list);
    },
    release(key) {
      const list = recent(key);
      list.pop();
      if (list.length) hits.set(key, list);
      else hits.delete(key);
    },
    reset(key) {
      hits.delete(key);
    },
    clear() {
      hits.clear();
    },
  };
}
