import { test } from "node:test";
import assert from "node:assert/strict";

import {
  parseBoolean,
  parseDuration,
  parseDurationEnv,
  parseIntEnv,
  parseLimit,
  parseList,
  parseOrigins,
  parsePage,
} from "../../src/lib/parse";

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
  assert.equal(parsePage("abc"), 1);
});

test("parsePage clamps huge values so that page * limit stays a safe integer", () => {
  assert.equal(parsePage("10000"), 10000);
  assert.equal(parsePage("10001"), 10000);
  assert.equal(parsePage("99999999999999999999"), 10000);
  assert.ok(Number.isSafeInteger(parsePage("99999999999999999999") * 100));
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

test("parseIntEnv returns the fallback when the variable is unset or empty", () => {
  assert.equal(parseIntEnv("PORT", undefined, 4000, 1, 65535), 4000);
  assert.equal(parseIntEnv("PORT", "", 4000, 1, 65535), 4000);
});

test("parseIntEnv accepts integers inside the range, bounds included", () => {
  assert.equal(parseIntEnv("PORT", "8080", 4000, 1, 65535), 8080);
  assert.equal(parseIntEnv("PORT", "1", 4000, 1, 65535), 1);
  assert.equal(parseIntEnv("PORT", "65535", 4000, 1, 65535), 65535);
  assert.equal(parseIntEnv("TRUST_PROXY_HOPS", "0", 0, 0, 5), 0);
  assert.equal(parseIntEnv("OFFSET", "-3", 0, -5, 5), -3);
});

test("parseIntEnv rejects anything that is not an integer in range, naming the variable", () => {
  const message = (name: string, min: number, max: number) => `${name} must be an integer between ${min} and ${max}`;
  for (const value of ["abc", "1.5", "1e3", "0x10", " 5", "5 ", "+5", "--1", "-"]) {
    assert.throws(() => parseIntEnv("LOGIN_RATE_MAX", value, 5, 1, 100), { message: message("LOGIN_RATE_MAX", 1, 100) }, value);
  }
  assert.throws(() => parseIntEnv("PORT", "0", 4000, 1, 65535), { message: message("PORT", 1, 65535) });
  assert.throws(() => parseIntEnv("PORT", "65536", 4000, 1, 65535), { message: message("PORT", 1, 65535) });
  assert.throws(() => parseIntEnv("PORT", "-1", 4000, 1, 65535), { message: message("PORT", 1, 65535) });
  assert.throws(() => parseIntEnv("X", "99999999999999999999", 1, 1, 10), { message: message("X", 1, 10) });
});

test("parseDurationEnv returns the fallback when the variable is unset or empty", () => {
  assert.equal(parseDurationEnv("JWT_EXPIRES_IN", undefined, 3600), 3600);
  assert.equal(parseDurationEnv("JWT_EXPIRES_IN", "", 3600), 3600);
});

test("parseDurationEnv understands seconds, minutes, hours and days", () => {
  assert.equal(parseDurationEnv("D", "90", 1), 90);
  assert.equal(parseDurationEnv("D", "15m", 1), 900);
  assert.equal(parseDurationEnv("D", "1h", 1), 3600);
  assert.equal(parseDurationEnv("D", "14d", 1), 14 * 86400);
  assert.equal(parseDurationEnv("D", "30S", 1), 30);
  assert.equal(parseDurationEnv("D", "2 h", 1), 7200);
  assert.equal(parseDurationEnv("D", "1", 5), 1);
});

test("parseDurationEnv rejects invalid or zero durations instead of falling back", () => {
  const message = (name: string) => `${name} must be a duration like 90, 15m, 1h or 14d (greater than zero)`;
  for (const value of ["abc", "0", "0m", "00d", "-5", "1.5h", "15 minutes", "1w", "h"]) {
    assert.throws(() => parseDurationEnv("REFRESH_TOKEN_TTL", value, 60), { message: message("REFRESH_TOKEN_TTL") }, value);
  }
});

test("parseOrigins lowercases, trims and removes trailing slashes", () => {
  assert.deepEqual([...parseOrigins("http://localhost:5173/", "http://x")], ["http://localhost:5173"]);
  assert.deepEqual(
    [...parseOrigins(" HTTPS://App.Example.com// , https://b.example.com ,, ", "http://x")],
    ["https://app.example.com", "https://b.example.com"],
  );
});

test("parseOrigins uses the fallback when the variable is unset or empty", () => {
  assert.deepEqual([...parseOrigins(undefined, "http://localhost:5173")], ["http://localhost:5173"]);
  assert.deepEqual([...parseOrigins("", "http://localhost:5173/")], ["http://localhost:5173"]);
});
