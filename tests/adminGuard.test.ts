import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

import { isGuardedAdminRequest, OPEN_ADMIN_ROUTES } from "../src/middlewares/adminGuard";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";
import { loginAsAdmin } from "./helpers/auth";

let request: Requester;
let close: () => Promise<void>;
let port: number;

before(async () => {
  ({ request, close, port } = await startTestServer());
  await resetDb();
});

after(async () => {
  await close();
  await closeDb();
});

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: string };

/** node:http sends the path exactly as written; fetch would normalise it. */
function raw(method: string, rawPath: string, headers: Record<string, string> = {}): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method, path: rawPath, headers, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }),
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

/** The same split the app does before routing. */
const split = (p: string) => p.split("/").filter(Boolean);

test("the guard covers every admin path except login, refresh and logout", () => {
  assert.deepEqual([...OPEN_ADMIN_ROUTES].sort(), [
    "POST /api/admin/auth/login",
    "POST /api/admin/auth/logout",
    "POST /api/admin/auth/refresh",
  ]);
  for (const route of OPEN_ADMIN_ROUTES) {
    const [method, p] = route.split(" ");
    assert.equal(isGuardedAdminRequest(method, split(p)), false, route);
  }

  const guarded: [string | undefined, string][] = [
    ["GET", "/api/admin"],
    ["GET", "/api/admin/auth/me"],
    ["GET", "/api/admin/auth/login"],
    ["DELETE", "/api/admin/auth/logout"],
    ["POST", "/api/admin/auth/login/extra"],
    ["GET", "/api/admin/news"],
    ["GET", "/api/admin/nope"],
    ["POST", "/api/admin/words"],
    [undefined, "/api/admin/news"],
  ];
  for (const [method, p] of guarded) assert.equal(isGuardedAdminRequest(method, split(p)), true, `${method} ${p}`);

  for (const p of ["/api/public/news", "/api/health", "/docs", "/api/administrator", "/admin/api", "/"]) {
    assert.equal(isGuardedAdminRequest("GET", split(p)), false, p);
  }
});

test("without a token every admin path answers 401, whether it exists or not", async () => {
  const paths: [string, string][] = [
    ["GET", "/api/admin"],
    ["GET", "/api/admin/"],
    ["GET", "/api/admin/nope"],
    ["DELETE", "/api/admin/nope/deeper"],
    ["GET", "/api/admin/auth/login"],
    ["GET", "/api/admin/auth/me"],
    ["GET", "/api/admin/news"],
    ["POST", "/api/admin/news"],
  ];
  for (const [method, p] of paths) {
    const res = await request(method, p);
    assert.equal(res.status, 401, `${method} ${p}`);
    assert.deepEqual(res.json, { error: "Unauthorized" }, `${method} ${p}`);
    assert.equal(res.headers.get("cache-control"), "no-store", `${method} ${p}`);
  }
});

test("empty segments and a trailing slash do not get around the guard", async () => {
  const { token } = await loginAsAdmin(request);
  for (const p of ["/api//admin/news", "/api/admin//news", "/api/admin/news/", "/api//admin//news//"]) {
    const bare = await raw("GET", p);
    assert.equal(bare.status, 401, `${p} without a token`);
    const authed = await raw("GET", p, { Authorization: `Bearer ${token}` });
    assert.equal(authed.status, 200, `${p} with a token reaches the news router, so the guard must see it too`);
  }
  // A target the URL parser reads as a host is not an admin path for anyone: never a 200 without a token.
  assert.notEqual((await raw("GET", "//api//admin//news")).status, 200);
});

test("the open routes are still reached without a token, and their own handler answers", async () => {
  const login = await request("POST", "/api/admin/auth/login", { body: {} });
  assert.equal(login.status, 400, "the login handler validated the body");

  // A refresh with an unknown token clears the cookie: only the refresh handler does that, the guard never does.
  const refresh = await request("POST", "/api/admin/auth/refresh", { cookie: "mateira_refresh=sconosciuto" });
  assert.equal(refresh.status, 401);
  assert.ok(
    refresh.setCookie.some((c) => c.startsWith("mateira_refresh=;")),
    `the refresh handler answered: ${JSON.stringify(refresh.setCookie)}`,
  );

  assert.equal((await request("POST", "/api/admin/auth/logout")).status, 204);
});

test("a valid token reaches every router, and only the app guard checks it", async () => {
  const { token } = await loginAsAdmin(request);
  assert.equal((await request("GET", "/api/admin/auth/me", { token })).status, 200);
  assert.equal((await request("GET", "/api/admin/news", { token })).status, 200);
  assert.equal((await request("GET", "/api/admin/media", { token })).status, 200);
  assert.equal((await request("GET", "/api/admin/home-blocks", { token })).status, 200);
  assert.equal((await request("GET", "/api/admin/nope", { token })).status, 404, "an unknown admin path is a 404 once authenticated");

  // One database lookup per request: the routers use the session the guard verified and never call requireAdmin.
  const modules = path.resolve(__dirname, "../src/modules");
  for (const name of fs.readdirSync(modules)) {
    const file = path.join(modules, name, "routes.ts");
    if (!fs.existsSync(file)) continue;
    assert.ok(!fs.readFileSync(file, "utf8").includes("requireAdmin"), `${name}/routes.ts must use the session from the app guard`);
  }
});
