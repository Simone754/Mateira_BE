import { test } from "node:test";
import assert from "node:assert/strict";

import { createRateLimiter } from "../../src/lib/rateLimit";

test("blocks after max hits and reports retry time", () => {
  let now = 1_000_000;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });

  assert.equal(limiter.check("k").allowed, true);
  limiter.hit("k");
  limiter.hit("k");

  const blocked = limiter.check("k");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 60);

  now += 30_000;
  assert.equal(limiter.check("k").retryAfterSec, 30);
});

test("allows again once the window has passed", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 1, now: () => now });
  limiter.hit("k");
  assert.equal(limiter.check("k").allowed, false);
  now = 1001;
  assert.equal(limiter.check("k").allowed, true);
});

test("keys are independent and reset clears one key", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  limiter.hit("a");
  assert.equal(limiter.check("a").allowed, false);
  assert.equal(limiter.check("b").allowed, true);
  limiter.reset("a");
  assert.equal(limiter.check("a").allowed, true);
});

test("retry hint uses the hit that frees a slot when hits exceed max", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });
  limiter.hit("k");
  now = 10_000;
  limiter.hit("k");
  now = 20_000;
  limiter.hit("k");

  now = 30_000;
  const blocked = limiter.check("k");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 40);
});

test("release gives back the most recent hit and is a no-op for unknown keys", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 60_000, max: 2, now: () => now });
  limiter.hit("k");
  now = 10_000;
  limiter.hit("k");
  assert.equal(limiter.check("k").allowed, false);

  limiter.release("k");
  assert.equal(limiter.check("k").allowed, true);

  // the hit from t=0 is still counted: a new hit at t=10s is blocked until t=60s
  limiter.hit("k");
  const blocked = limiter.check("k");
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfterSec, 50);

  assert.doesNotThrow(() => limiter.release("never-seen"));
  assert.equal(limiter.check("never-seen").allowed, true);
});

test("release on the last hit leaves the key empty", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  limiter.hit("k");
  assert.equal(limiter.check("k").allowed, false);
  limiter.release("k");
  assert.equal(limiter.check("k").allowed, true);
  assert.doesNotThrow(() => limiter.release("k"));
  assert.equal(limiter.check("k").allowed, true);
});

test("size counts the tracked keys", () => {
  const limiter = createRateLimiter({ windowMs: 1000, max: 1 });
  assert.equal(limiter.size(), 0);
  limiter.hit("a");
  limiter.hit("a");
  limiter.hit("b");
  assert.equal(limiter.size(), 2);
  limiter.reset("a");
  assert.equal(limiter.size(), 1);
  limiter.clear();
  assert.equal(limiter.size(), 0);
});

test("every sweepEvery-th hit drops the keys whose hits are all older than the window", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 5, sweepEvery: 2, now: () => now });

  limiter.hit("a");
  limiter.hit("b");
  assert.equal(limiter.size(), 2);

  now = 1500;
  limiter.hit("c");
  assert.equal(limiter.size(), 3, "the third hit does not sweep: expired keys are still tracked");
  limiter.hit("d");
  assert.equal(limiter.size(), 2, "the fourth hit sweeps and drops a and b");

  assert.equal(limiter.check("c").allowed, true);
  limiter.hit("c");
  limiter.hit("c");
  assert.equal(limiter.size(), 2);
});

test("a sweep keeps keys that still have a hit inside the window", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 2, sweepEvery: 2, now: () => now });

  limiter.hit("old");
  now = 600;
  limiter.hit("active");
  assert.equal(limiter.size(), 2, "old is still inside the window");

  now = 1100;
  limiter.hit("active");
  limiter.hit("fresh");
  assert.equal(limiter.size(), 2, "old is dropped, active and fresh survive");

  const blocked = limiter.check("active");
  assert.equal(blocked.allowed, false, "active keeps both of its hits");
  assert.equal(blocked.retryAfterSec, 1);
  assert.equal(limiter.check("fresh").allowed, true);
});

test("sweepEvery defaults to 1000 hits", () => {
  let now = 0;
  const limiter = createRateLimiter({ windowMs: 1000, max: 5, now: () => now });

  limiter.hit("old");
  now = 2000;
  for (let i = 1; i < 999; i++) limiter.hit(`key-${i}`);
  assert.equal(limiter.size(), 999, "999 hits so far: nothing has been swept");

  limiter.hit("key-999");
  assert.equal(limiter.size(), 999, "the 1000th hit sweeps old away");
});
