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

function fakeReq(forwarded: string | string[] | undefined, remoteAddress: string | null = "127.0.0.1"): IncomingMessage {
  return {
    headers: forwarded === undefined ? {} : { "x-forwarded-for": forwarded },
    socket: { remoteAddress: remoteAddress ?? undefined },
  } as unknown as IncomingMessage;
}

test("clientIp with 0 hops ignores X-Forwarded-For", () => {
  const req = fakeReq("9.9.9.9, 10.0.0.1");
  assert.equal(clientIp(req, 0), "127.0.0.1");
  assert.equal(clientIp(req, -1), "127.0.0.1");
});

test("clientIp with 1 hop takes the rightmost entry, the one added by the proxy", () => {
  assert.equal(clientIp(fakeReq("9.9.9.9, 10.0.0.1"), 1), "10.0.0.1");
  assert.equal(clientIp(fakeReq("203.0.113.7"), 1), "203.0.113.7");
});

test("clientIp with 2 hops takes the second entry from the right", () => {
  assert.equal(clientIp(fakeReq("9.9.9.9, 203.0.113.7, 10.0.0.1"), 2), "203.0.113.7");
  assert.equal(clientIp(fakeReq("203.0.113.7, 10.0.0.1"), 2), "203.0.113.7");
});

test("clientIp falls back to the socket address when there are fewer entries than hops", () => {
  assert.equal(clientIp(fakeReq("203.0.113.7"), 2), "127.0.0.1");
  assert.equal(clientIp(fakeReq(undefined), 1), "127.0.0.1");
  assert.equal(clientIp(fakeReq(" , ,"), 1), "127.0.0.1");
});

test("clientIp ignores entries a client spoofs on the left", () => {
  const req = fakeReq("1.1.1.1, 2.2.2.2, 203.0.113.7");
  assert.equal(clientIp(req, 1), "203.0.113.7");
  assert.equal(clientIp(fakeReq("1.1.1.1, 2.2.2.2, 203.0.113.7, 10.0.0.1"), 2), "203.0.113.7");
});

test("clientIp reads every value of a repeated X-Forwarded-For header", () => {
  assert.equal(clientIp(fakeReq(["9.9.9.9", "10.0.0.1"]), 1), "10.0.0.1");
  assert.equal(clientIp(fakeReq(["9.9.9.9, 8.8.8.8", "10.0.0.1"]), 2), "8.8.8.8");
  assert.equal(clientIp(fakeReq(["9.9.9.9", "8.8.8.8", "10.0.0.1"]), 3), "9.9.9.9");
});

test("clientIp trims entries and drops empty ones", () => {
  assert.equal(clientIp(fakeReq(" 9.9.9.9 ,, 10.0.0.1 ,"), 1), "10.0.0.1");
  assert.equal(clientIp(fakeReq(" 9.9.9.9 ,, 10.0.0.1 ,"), 2), "9.9.9.9");
});

test("clientIp strips the port from IPv4 addresses", () => {
  assert.equal(clientIp(fakeReq("1.2.3.4:5678"), 1), "1.2.3.4");
  assert.equal(clientIp(fakeReq("9.9.9.9, 1.2.3.4:5678"), 1), "1.2.3.4");
});

test("clientIp strips brackets and port from IPv6 and leaves bare IPv6 untouched", () => {
  assert.equal(clientIp(fakeReq("[2001:db8::1]:443"), 1), "2001:db8::1");
  assert.equal(clientIp(fakeReq("[2001:db8::1]"), 1), "2001:db8::1");
  assert.equal(clientIp(fakeReq("2001:db8::1"), 1), "2001:db8::1");
  assert.equal(clientIp(fakeReq("2001:db8:85a3::8a2e:370:7334"), 1), "2001:db8:85a3::8a2e:370:7334");
});

test("clientIp strips the IPv4-mapped IPv6 prefix", () => {
  assert.equal(clientIp(fakeReq("::ffff:1.2.3.4"), 1), "1.2.3.4");
  assert.equal(clientIp(fakeReq("::FFFF:1.2.3.4"), 1), "1.2.3.4");
  assert.equal(clientIp(fakeReq("[::ffff:1.2.3.4]:80"), 1), "1.2.3.4");
});

test("clientIp answers unknown when no address is available", () => {
  assert.equal(clientIp(fakeReq(undefined, null), 0), "unknown");
  assert.equal(clientIp(fakeReq(undefined, null), 1), "unknown");
  assert.equal(clientIp(fakeReq("[]"), 1), "unknown");
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
