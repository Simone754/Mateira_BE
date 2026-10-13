import { after, before, beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/plugins/prisma";
import { newObjectKey } from "../src/modules/media/service";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";
import { loginAsAdmin } from "./helpers/auth";

let request: Requester;
let close: () => Promise<void>;
let token: string;

before(async () => {
  ({ request, close } = await startTestServer());
});

after(async () => {
  await close();
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  ({ token } = await loginAsAdmin(request));
});

test("newObjectKey puts files under media/<year>/ with the right extension", () => {
  assert.match(newObjectKey("image/png", new Date("2026-03-01T00:00:00Z")), /^media\/2026\/[0-9a-f-]{36}\.png$/);
  assert.match(newObjectKey("application/pdf"), /\.pdf$/);
});

test("media routes need the admin token", async () => {
  assert.equal((await request("POST", "/api/admin/media/presign", { body: {} })).status, 401);
  assert.equal((await request("GET", "/api/admin/media")).status, 401);
});

test("presign creates a media row and returns a signed upload URL", async () => {
  const res = await request("POST", "/api/admin/media/presign", {
    token,
    body: { contentType: "image/png", size: 1234, alt: "Veduta del porto" },
  });

  assert.equal(res.status, 200);
  assert.equal(res.json.method, "PUT");
  assert.equal(res.json.headers["Content-Type"], "image/png");
  assert.match(res.json.uploadUrl, /^http:\/\/localhost:9100\/mateira-media\/media\/\d{4}\/.+\.png\?/);
  assert.equal(res.json.media.alt, "Veduta del porto");
  assert.match(res.json.media.url, /^http:\/\/localhost:9100\/mateira-media\/media\//);

  assert.equal(await prisma.media.count(), 1);
});

test("images require alt text, pdfs do not", async () => {
  const noAlt = await request("POST", "/api/admin/media/presign", { token, body: { contentType: "image/jpeg", size: 10 } });
  assert.equal(noAlt.status, 400);
  assert.match(noAlt.json.error, /alt/);

  const pdf = await request("POST", "/api/admin/media/presign", { token, body: { contentType: "application/pdf", size: 10 } });
  assert.equal(pdf.status, 200);
  assert.equal(pdf.json.media.alt, null);
});

test("unsupported types and oversize files are rejected", async () => {
  const exe = await request("POST", "/api/admin/media/presign", { token, body: { contentType: "application/x-msdownload", size: 10, alt: "x" } });
  assert.equal(exe.status, 400);

  const big = await request("POST", "/api/admin/media/presign", { token, body: { contentType: "image/png", size: 99 * 1024 * 1024, alt: "x" } });
  assert.equal(big.status, 400);

  const zero = await request("POST", "/api/admin/media/presign", { token, body: { contentType: "image/png", size: 0, alt: "x" } });
  assert.equal(zero.status, 400);
});

test("prototype keys are not accepted as content types", async () => {
  for (const contentType of ["constructor", "__proto__"]) {
    const res = await request("POST", "/api/admin/media/presign", {
      token,
      body: { contentType, size: 10, alt: "x" },
    });
    assert.equal(res.status, 400, `${contentType} must be rejected`);
  }
  assert.equal(await prisma.media.count(), 0);
});

test("the presigned URL binds content type and length", async () => {
  const res = await request("POST", "/api/admin/media/presign", {
    token,
    body: { contentType: "image/png", size: 1234, alt: "Veduta del porto" },
  });
  assert.equal(res.status, 200);

  const signedHeaders = (new URL(res.json.uploadUrl).searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");
  assert.ok(signedHeaders.includes("content-type"), `signed headers: ${signedHeaders.join(";")}`);
  assert.ok(signedHeaders.includes("content-length"), `signed headers: ${signedHeaders.join(";")}`);
  assert.ok(signedHeaders.includes("host"), `signed headers: ${signedHeaders.join(";")}`);
  assert.deepEqual(res.json.headers, { "Content-Type": "image/png" });
});

test("list, update alt and delete", async () => {
  const created = await request("POST", "/api/admin/media/presign", { token, body: { contentType: "image/webp", size: 50, alt: "Prima" } });
  const id = created.json.media.id;

  const list = await request("GET", "/api/admin/media?limit=10", { token });
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].id, id);

  const patched = await request("PATCH", `/api/admin/media/${id}`, { token, body: { alt: "Seconda" } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.alt, "Seconda");

  const clearing = await request("PATCH", `/api/admin/media/${id}`, { token, body: { alt: "" } });
  assert.equal(clearing.status, 400, "an image cannot lose its alt text");

  // No storage server runs in tests: the best-effort object delete fails and logs a warning.
  const warn = mock.method(console, "warn", () => {});
  try {
    assert.equal((await request("DELETE", `/api/admin/media/${id}`, { token })).status, 204);
    assert.equal((await request("DELETE", `/api/admin/media/${id}`, { token })).status, 404);
    assert.equal(warn.mock.calls.length, 1, "the failed object delete is logged once");
  } finally {
    warn.mock.restore();
  }
  assert.equal(await prisma.media.count(), 0);
});
