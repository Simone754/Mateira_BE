import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";

import { clientIp, parseCookies, serializeCookie } from "../../src/lib/http";

test("parseCookies reads names and decodes values", () => {
  assert.deepEqual(parseCookies("a=1; b=hello%20world; c="), { a: "1", b: "hello world", c: "" });
  assert.deepEqual(parseCookies(undefined), {});
  assert.deepEqual(parseCookies("broken"), {});
});

test("serializeCookie is HttpOnly and SameSite=Strict by default", () => {
  const cookie = serializeCookie("sid", "a b", { path: "/api", maxAge: 60.9 });
  assert.equal(cookie, "sid=a%20b; Path=/api; Max-Age=60; HttpOnly; SameSite=Strict");
});

test("serializeCookie adds Secure when asked", () => {
  assert.match(serializeCookie("sid", "x", { secure: true }), /; Secure;/);
});

test("clientIp ignores X-Forwarded-For unless the proxy is trusted", () => {
  const req = {
    headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" },
    socket: { remoteAddress: "127.0.0.1" },
  } as unknown as IncomingMessage;
  assert.equal(clientIp(req, false), "127.0.0.1");
  assert.equal(clientIp(req, true), "9.9.9.9");
});
