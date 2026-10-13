import { after, before, test } from "node:test";
import assert from "node:assert/strict";

import { closeDb, startTestServer, type Requester } from "./helpers/app";

let request: Requester;
let close: () => Promise<void>;

before(async () => {
  ({ request, close } = await startTestServer());
});

after(async () => {
  await close();
  await closeDb();
});

test("GET /api/health reports ok when the database answers", async () => {
  const res = await request("GET", "/api/health");
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, { status: "ok" });
});

test("unknown routes answer 404 as json", async () => {
  const res = await request("GET", "/api/nope");
  assert.equal(res.status, 404);
  assert.equal(res.json.error, "Not found");
});

test("security headers are always present", async () => {
  const res = await request("GET", "/api/health");
  assert.equal(res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(res.headers.get("referrer-policy"), "no-referrer");
});

test("CORS allows a listed origin with credentials", async () => {
  const res = await request("OPTIONS", "/api/admin/auth/login", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal(res.headers.get("access-control-allow-credentials"), "true");
});

test("CORS does not answer an unknown origin", async () => {
  const res = await request("OPTIONS", "/api/admin/auth/login", { headers: { Origin: "https://evil.example" } });
  assert.equal(res.headers.get("access-control-allow-origin"), null);
});
