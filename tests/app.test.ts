import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

import { createApp } from "../src/app";
import { closeDb, startTestServer, type Requester } from "./helpers/app";

let request: Requester;
let close: () => Promise<void>;
let port: number;
// Keep-alive, so a "Connection: close" in an answer can only come from the server.
const agent = new http.Agent({ keepAlive: true });

before(async () => {
  ({ request, close, port } = await startTestServer());
});

after(async () => {
  agent.destroy();
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

function variesOnOrigin(vary: string | null): boolean {
  return (vary ?? "").split(",").some((value) => value.trim().toLowerCase() === "origin");
}

test("CORS varies on Origin even for unknown or missing origins, so caches keep the answers apart", async () => {
  const unknown = await request("GET", "/api/health", { headers: { Origin: "https://evil.example" } });
  assert.equal(unknown.headers.get("access-control-allow-origin"), null);
  assert.ok(variesOnOrigin(unknown.headers.get("vary")), `vary: ${unknown.headers.get("vary")}`);

  const missing = await request("GET", "/api/health");
  assert.ok(variesOnOrigin(missing.headers.get("vary")), `vary: ${missing.headers.get("vary")}`);

  const allowed = await request("GET", "/api/health", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(allowed.headers.get("vary"), "Origin");
});

test("CORS exposes Retry-After so the browser can read the rate limit answer", async () => {
  const preflight = await request("OPTIONS", "/api/admin/auth/login", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(preflight.headers.get("access-control-expose-headers"), "Retry-After");

  const simple = await request("GET", "/api/health", { headers: { Origin: "http://localhost:5173" } });
  assert.equal(simple.headers.get("access-control-expose-headers"), "Retry-After");
});

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: string };

/** Sends a request with node:http, which lets a test set headers that fetch refuses (Host) and read hop-by-hop ones (Connection). */
function rawRequest(
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: Buffer } = {},
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, method, path, headers: options.headers, agent },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end(options.body);
  });
}

test("a malformed Host header does not break the request", async () => {
  const res = await rawRequest("GET", "/api/health", { headers: { Host: "[" } });
  assert.equal(res.status, 200);
  assert.deepEqual(JSON.parse(res.body), { status: "ok" });
});

test("a body over the limit is a 413 and the connection is closed", async () => {
  const body = Buffer.alloc(1_000_001, "a");
  const res = await rawRequest("POST", "/api/admin/auth/login", {
    headers: { "Content-Type": "application/json", "Content-Length": String(body.length) },
    body,
  });
  assert.equal(res.status, 413);
  assert.equal(res.headers["connection"], "close");
  assert.equal(JSON.parse(res.body).error, "payload too large");
});

test("a normal error does not force the connection closed", async () => {
  const res = await rawRequest("POST", "/api/admin/auth/login", {
    headers: { "Content-Type": "application/json" },
    body: Buffer.from("{bad"),
  });
  assert.equal(res.status, 400);
  assert.notEqual(res.headers["connection"], "close");
});

test("an error after the response has started destroys the connection and writes nothing more", async () => {
  // A stand-in response whose body can no longer be written, as when the client has gone away mid-answer.
  let destroyed!: () => void;
  const destroyCalled = new Promise<void>((resolve) => (destroyed = resolve));
  let destroyCount = 0;
  const res = {
    headersSent: true,
    statusCode: 200,
    setHeader() {},
    appendHeader() {},
    end() {
      throw new Error("write after end");
    },
    destroy() {
      destroyCount++;
      destroyed();
    },
  };
  const req = { method: "GET", url: "/api/health", headers: {} };

  const error = mock.method(console, "error", () => {});
  try {
    createApp().emit("request", req, res);
    await Promise.race([destroyCalled, new Promise((resolve) => setTimeout(resolve, 2000))]);
    assert.equal(destroyCount, 1, "the connection must be destroyed once");
    assert.equal(error.mock.calls.length, 0, "no 500 answer is attempted");
  } finally {
    error.mock.restore();
  }
});
