import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/plugins/prisma";
import { signJwt } from "../src/plugins/jwt";
import { ensureSuperuser, hashPassword } from "../src/modules/auth/service";
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

  const oldLogin = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(oldLogin.status, 401, "the replaced password must stop working");
  const newLogin = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: "another-long-password" } });
  assert.equal(newLogin.status, 200);

  await assert.rejects(() => ensureSuperuser(ADMIN_EMAIL, "short"), (e: any) => e.status === 400);
  await assert.rejects(() => ensureSuperuser("not-an-email", ADMIN_PASSWORD), (e: any) => e.status === 400);
  await assert.rejects(() => ensureSuperuser(ADMIN_EMAIL, " ".repeat(10) + "ab"), (e: any) => e.status === 400);
});

test("re-seeding with the same password keeps existing sessions", async () => {
  const { cookie } = await loginAsAdmin(request);

  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);

  const refreshed = await request("POST", "/api/admin/auth/refresh", { cookie });
  assert.equal(refreshed.status, 200);
});

test("re-seeding with a different password revokes existing sessions", async () => {
  const { cookie } = await loginAsAdmin(request);

  await ensureSuperuser(ADMIN_EMAIL, "another-long-password");

  const refreshed = await request("POST", "/api/admin/auth/refresh", { cookie });
  assert.equal(refreshed.status, 401);
});

test("seeding with a different email replaces the superuser instead of adding a second one", async () => {
  const { cookie } = await loginAsAdmin(request);
  const before = await prisma.user.findFirstOrThrow();

  const updated = await ensureSuperuser("New.Admin@test.local", ADMIN_PASSWORD);

  assert.equal(await prisma.user.count(), 1);
  assert.equal(updated.id, before.id);
  assert.equal(updated.email, "new.admin@test.local");

  const oldLogin = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(oldLogin.status, 401, "the old email must stop working");
  const newLogin = await request("POST", "/api/admin/auth/login", { body: { email: "new.admin@test.local", password: ADMIN_PASSWORD } });
  assert.equal(newLogin.status, 200);

  const refreshed = await request("POST", "/api/admin/auth/refresh", { cookie });
  assert.equal(refreshed.status, 401, "a session opened before the change must be revoked");
});

test("seeding with a different email and password changes both in one go", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);

  await ensureSuperuser("other@test.local", "another-long-password");

  assert.equal(await prisma.user.count(), 1);
  const oldLogin = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  assert.equal(oldLogin.status, 401);
  const newLogin = await request("POST", "/api/admin/auth/login", { body: { email: "other@test.local", password: "another-long-password" } });
  assert.equal(newLogin.status, 200);
});

test("re-seeding with identical values changes nothing and keeps sessions alive", async () => {
  const { cookie } = await loginAsAdmin(request);
  const before = await prisma.user.findFirstOrThrow();

  const returned = await ensureSuperuser(ADMIN_EMAIL.toUpperCase(), ADMIN_PASSWORD);

  const after = await prisma.user.findFirstOrThrow();
  assert.equal(await prisma.user.count(), 1);
  assert.equal(returned.id, before.id);
  assert.equal(after.email, before.email);
  assert.equal(after.passwordHash, before.passwordHash, "the hash must not be recomputed");
  assert.equal(after.updatedAt.getTime(), before.updatedAt.getTime());

  const refreshed = await request("POST", "/api/admin/auth/refresh", { cookie });
  assert.equal(refreshed.status, 200);
});

test("seeding refuses to guess when more than one superuser exists", async () => {
  const hash = await hashPassword(ADMIN_PASSWORD);
  await prisma.user.create({ data: { email: "first@test.local", passwordHash: hash, role: "SUPERUSER" } });
  await prisma.user.create({ data: { email: "second@test.local", passwordHash: hash, role: "SUPERUSER" } });
  const before = await prisma.user.findMany({ orderBy: { email: "asc" } });

  for (const [email, password] of [
    ["first@test.local", ADMIN_PASSWORD],
    ["third@test.local", ADMIN_PASSWORD],
    ["first@test.local", "another-long-password"],
  ]) {
    await assert.rejects(
      () => ensureSuperuser(email, password),
      (e: any) => e.status === 409 && /more than one superuser/.test(e.message),
    );
  }

  assert.deepEqual(await prisma.user.findMany({ orderBy: { email: "asc" } }), before, "no row may change");
});

test("the password is used exactly as typed, whitespace included", async () => {
  const password = "correct-horse-battery\n";
  await ensureSuperuser(ADMIN_EMAIL, password);

  const without = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: password.trim() } });
  assert.equal(without.status, 401);

  const exact = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password } });
  assert.equal(exact.status, 200);
});

test("login rejects a missing, empty or non-string password with 400", async () => {
  for (const password of [undefined, "", 12345]) {
    const res = await request("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password } });
    assert.equal(res.status, 400);
  }
});

test("parallel failed logins cannot get past the rate limit", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const bad = { email: ADMIN_EMAIL, password: "wrong-password" };

  const results = await Promise.all(
    Array.from({ length: 10 }, () => request("POST", "/api/admin/auth/login", { body: bad })),
  );

  assert.equal(results.filter((r) => r.status === 401).length, 3);
  assert.equal(results.filter((r) => r.status === 429).length, 7);
});

test("successful logins do not use up the per-IP login budget", async () => {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const good = { email: ADMIN_EMAIL, password: ADMIN_PASSWORD };

  // the per-IP limit is LOGIN_RATE_MAX * 4 = 12
  for (let i = 0; i < 15; i++) {
    assert.equal((await request("POST", "/api/admin/auth/login", { body: good })).status, 200);
  }
});

test("concurrent reuse of one refresh token has a single winner and revokes the chain", async () => {
  const { cookie } = await loginAsAdmin(request);

  const results = await Promise.all(
    Array.from({ length: 5 }, () => request("POST", "/api/admin/auth/refresh", { cookie })),
  );

  const winners = results.filter((r) => r.status === 200);
  assert.equal(winners.length, 1);
  assert.equal(results.filter((r) => r.status === 401).length, 4);

  const winnerCookie = refreshPair(winners[0].setCookie);
  const afterTheft = await request("POST", "/api/admin/auth/refresh", { cookie: winnerCookie });
  assert.equal(afterTheft.status, 401, "the winner's new token must be revoked with the rest of the chain");
});
