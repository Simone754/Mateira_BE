import { test } from "node:test";
import assert from "node:assert/strict";
import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";

import { clientIp, parseCookies, readJson, serializeCookie } from "../../src/lib/http";

const is = (code: number) => (err: unknown) => (err as { status?: number }).status === code;

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

test("readJson decodes a multi-byte character split across chunks", async () => {
  const full = Buffer.from('{"t":"perché"}', "utf8");
  const split = full.indexOf(0xc3) + 1;
  const req = Readable.from([full.subarray(0, split), full.subarray(split)]) as unknown as IncomingMessage;
  assert.deepEqual(await readJson<{ t: string }>(req), { t: "perché" });
});

test("readJson returns null for an empty body", async () => {
  const req = Readable.from([]) as unknown as IncomingMessage;
  assert.equal(await readJson(req), null);
});

test("readJson rejects invalid JSON with 400", async () => {
  const req = Readable.from([Buffer.from("{bad")]) as unknown as IncomingMessage;
  await assert.rejects(readJson(req), is(400));
});

test("readJson rejects bodies over 1,000,000 bytes with 413", async () => {
  const req = Readable.from([Buffer.alloc(600_000), Buffer.alloc(600_000)]) as unknown as IncomingMessage;
  await assert.rejects(readJson(req), is(413));
});
