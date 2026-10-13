import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/plugins/prisma";
import { signJwt } from "../src/plugins/jwt";
import { ensureSuperuser } from "../src/modules/auth/service";
import { resetLoginLimiters } from "../src/modules/auth/routes";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin, refreshPair } from "./helpers/auth";

let request: Requester;
let close: () => Promise<void>;

before(async () => {
  ({ request, close } = await startTestServer());
});

after(async () => {
  await close();
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  resetLoginLimiters();
});

test("login returns an access token and an HttpOnly refresh cookie", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await request("POST", "/api/admin/auth/login", { body: { email: "ADMIN@test.local", password: ADMIN_PASSWORD } });

  assert.equal(res.status, 200);
  assert.equal(typeof res.json.accessToken, "string");
  assert.equal(res.json.user.email, ADMIN_EMAIL);
  assert.equal(res.json.user.role, "SUPERUSER");
  assert.equal(res.json.user.passwordHash, undefined);

  const cookie = res.setCookie.find((c) => c.startsWith("mateira_refresh="));
  assert.ok(cookie);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/admin\/auth/);
});

test("wrong password and unknown email give the same 401", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const wrong = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: "wrong-password" } });
  const unknown = await request("POST", "/api/admin/auth/login", { body: { email: "nobody@test.local", password: "wrong-password" } });

  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.json, unknown.json);
});

test("login without a body is a 400", async () => {
  const res = await request("POST", "/api/admin/auth/login");
  assert.equal(res.status, 400);
});

test("too many failed logins are blocked with 429 and Retry-After", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const bad = { email: ADMIN_EMAIL, password: "wrong-password" };

  for (let i = 0; i < 3; i++) {
    assert.equal((await request("POST", "/api/admin/auth/login", { body: bad })).status, 401);
  }

  const blocked = await request("POST", "/api/admin/auth/login", { body: bad });
  assert.equal(blocked.status, 429);
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);

  const correct = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(correct.status, 429);
});

test("/me needs a valid admin token", async () => {
  const { token } = await loginAsAdmin(request);

  assert.equal((await request("GET", "/api/admin/auth/me")).status, 401);
  assert.equal((await request("GET", "/api/admin/auth/me", { token: "garbage" })).status, 401);
  assert.equal((await request("GET", "/api/admin/auth/me", { token: signJwt({ sub: "x", role: "USER" }) })).status, 401);

  const ok = await request("GET", "/api/admin/auth/me", { token });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.user.email, ADMIN_EMAIL);
});

test("a token for a deleted user stops working", async () => {
  const { token } = await loginAsAdmin(request);
  await prisma.user.deleteMany();
  assert.equal((await request("GET", "/api/admin/auth/me", { token })).status, 401);
});

test("refresh rotates the token and the old one is revoked", async () => {
  const { cookie } = await loginAsAdmin(request);

  const refreshed = await request("POST", "/api/admin/auth/refresh", { cookie });
  assert.equal(refreshed.status, 200);
  assert.equal(typeof refreshed.json.accessToken, "string");
  const newCookie = refreshPair(refreshed.setCookie);
  assert.notEqual(newCookie, cookie);

  const reused = await request("POST", "/api/admin/auth/refresh", { cookie });
  assert.equal(reused.status, 401);

  const afterTheft = await request("POST", "/api/admin/auth/refresh", { cookie: newCookie });
  assert.equal(afterTheft.status, 401, "reusing an old token must revoke the whole chain");
});

test("refresh without a cookie is a 401", async () => {
  assert.equal((await request("POST", "/api/admin/auth/refresh")).status, 401);
});

test("logout revokes the refresh token and clears the cookie", async () => {
  const { cookie } = await loginAsAdmin(request);

  const out = await request("POST", "/api/admin/auth/logout", { cookie });
  assert.equal(out.status, 204);
  assert.match(out.setCookie[0], /Max-Age=0/);

  assert.equal((await request("POST", "/api/admin/auth/refresh", { cookie })).status, 401);
});

test("admin responses are never cached", async () => {
  const { token } = await loginAsAdmin(request);
  const res = await request("GET", "/api/admin/auth/me", { token });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

test("ensureSuperuser is idempotent and enforces a password length", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  await ensureSuperuser(ADMIN_EMAIL, "another-long-password");
  assert.equal(await prisma.user.count(), 1);

  await assert.rejects(() => ensureSuperuser(ADMIN_EMAIL, "short"), (e: any) => e.status === 400);
  await assert.rejects(() => ensureSuperuser("not-an-email", ADMIN_PASSWORD), (e: any) => e.status === 400);
});
