import { test } from "node:test";
import assert from "node:assert/strict";

import { parseBoolean, parseDuration, parseLimit, parseList, parsePage } from "../../src/lib/parse";

test("parseDuration understands units and falls back", () => {
  assert.equal(parseDuration("90", 1), 90);
  assert.equal(parseDuration("15m", 1), 900);
  assert.equal(parseDuration("1h", 1), 3600);
  assert.equal(parseDuration("14d", 1), 14 * 86400);
  assert.equal(parseDuration("abc", 7), 7);
  assert.equal(parseDuration(undefined, 7), 7);
});

test("parseLimit clamps between 1 and max", () => {
  assert.equal(parseLimit("10", 20, 50), 10);
  assert.equal(parseLimit("999", 20, 50), 50);
  assert.equal(parseLimit("0", 20, 50), 1);
  assert.equal(parseLimit("x", 20, 50), 20);
  assert.equal(parseLimit(null, 20, 50), 20);
});

test("parsePage defaults to 1", () => {
  assert.equal(parsePage("3"), 3);
  assert.equal(parsePage("0"), 1);
  assert.equal(parsePage("-2"), 1);
  assert.equal(parsePage(undefined), 1);
});

test("parseBoolean accepts true, 1 and yes", () => {
  assert.equal(parseBoolean("true"), true);
  assert.equal(parseBoolean("YES"), true);
  assert.equal(parseBoolean("1"), true);
  assert.equal(parseBoolean("false"), false);
  assert.equal(parseBoolean(undefined), false);
});

test("parseList trims, drops empties and can lowercase", () => {
  assert.deepEqual([...parseList(" A, b ,,C ", true)], ["a", "b", "c"]);
  assert.deepEqual([...parseList("A,b", false)], ["A", "b"]);
  assert.equal(parseList(undefined, true).size, 0);
});
