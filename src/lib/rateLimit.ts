export type RateLimitState = { allowed: boolean; retryAfterSec: number };

export type RateLimiter = {
  check(key: string): RateLimitState;
  hit(key: string): void;
  /** Removes the most recent hit of a key, e.g. to give back a hit that turned out not to count. */
  release(key: string): void;
  reset(key: string): void;
  clear(): void;
  /** Number of keys currently tracked, expired ones that have not been swept yet included. */
  size(): number;
};

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  now?: () => number;
  /** Every this many calls to hit() the whole map is swept for expired keys. Defaults to 1000. */
  sweepEvery?: number;
}): RateLimiter {
  const now = options.now ?? Date.now;
  const sweepEvery = Math.max(1, Math.floor(options.sweepEvery ?? 1000));
  const hits = new Map<string, number[]>();
  let hitCount = 0;

  function recent(key: string): number[] {
    const cutoff = now() - options.windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  // Keys that are never touched again would stay in the map forever: drop every key whose hits are all expired.
  function sweep(): void {
    const cutoff = now() - options.windowMs;
    for (const [key, list] of hits) {
      if (!list.some((t) => t > cutoff)) hits.delete(key);
    }
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
      if (++hitCount % sweepEvery === 0) sweep();
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
    size() {
      return hits.size;
    },
  };
}
