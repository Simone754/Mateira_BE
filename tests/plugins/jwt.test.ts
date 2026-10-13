import { test } from "node:test";
import assert from "node:assert/strict";

import { signJwt, verifyJwt } from "../../src/plugins/jwt";

test("a signed token verifies and carries its claims", () => {
  const token = signJwt({ sub: "user-1", role: "SUPERUSER" });
  const payload = verifyJwt(token);
  assert.equal(payload?.sub, "user-1");
  assert.equal(payload?.role, "SUPERUSER");
});

test("a tampered token is rejected", () => {
  const [header, , signature] = signJwt({ sub: "user-1" }).split(".");
  const forgedBody = Buffer.from(JSON.stringify({ sub: "attacker", exp: 9999999999 })).toString("base64url");
  assert.equal(verifyJwt(`${header}.${forgedBody}.${signature}`), null);
});

test("an expired token is rejected", () => {
  assert.equal(verifyJwt(signJwt({ sub: "user-1" }, -5)), null);
});

test("garbage is rejected", () => {
  assert.equal(verifyJwt("not-a-token"), null);
  assert.equal(verifyJwt("a.b.c"), null);
});
