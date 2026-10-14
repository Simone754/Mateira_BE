import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import vm from "node:vm";

import SwaggerParser from "@apidevtools/swagger-parser";

import { openApiSpec } from "../src/modules/docs/openapi";
import { handleDocs } from "../src/modules/docs/routes";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";

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

const swaggerDir = path.dirname(require.resolve("swagger-ui-dist/package.json"));

const ASSETS: [name: string, contentType: string][] = [
  ["swagger-ui.css", "text/css"],
  ["swagger-ui-bundle.js", "application/javascript"],
  ["swagger-ui-standalone-preset.js", "application/javascript"],
  ["favicon-16x16.png", "image/png"],
  ["favicon-32x32.png", "image/png"],
];

// Every route of the router, written out by hand: the documentation must list exactly these.
const ROUTES = [
  "GET /api/health",
  "POST /api/admin/auth/login",
  "POST /api/admin/auth/refresh",
  "POST /api/admin/auth/logout",
  "GET /api/admin/auth/me",
  "POST /api/admin/media/presign",
  "GET /api/admin/media",
  "PATCH /api/admin/media/{id}",
  "DELETE /api/admin/media/{id}",
  "GET /api/admin/news",
  "POST /api/admin/news",
  "GET /api/admin/news/{id}",
  "PATCH /api/admin/news/{id}",
  "DELETE /api/admin/news/{id}",
  "GET /api/public/news",
  "GET /api/public/news/{slug}",
];

// The admin routes that are open on purpose: they are how a session starts, renews and ends.
const OPEN_ADMIN_ROUTES = [
  "POST /api/admin/auth/login",
  "POST /api/admin/auth/refresh",
  "POST /api/admin/auth/logout",
];

type Operation = { key: string; method: string; path: string; op: any };

const HTTP_METHODS = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];

function operationsOf(spec: any): Operation[] {
  const found: Operation[] = [];
  for (const [pathName, item] of Object.entries<any>(spec.paths)) {
    for (const method of HTTP_METHODS) {
      if (item[method]) {
        found.push({ key: `${method.toUpperCase()} ${pathName}`, method: method.toUpperCase(), path: pathName, op: item[method] });
      }
    }
  }
  return found;
}

type RawResponse = { status: number; headers: http.IncomingHttpHeaders; body: Buffer };

/** node:http sends the path exactly as written, which fetch does not: it normalises dot segments. */
function rawGet(rawPath: string): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, method: "GET", path: rawPath, agent: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

test("GET /openapi.json serves the OpenAPI 3.0.3 document with every route", async () => {
  const res = await request("GET", "/openapi.json");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^application\/json/);
  assert.equal(res.json.openapi, "3.0.3");
  assert.equal(res.json.info.title, "Mateira API");
  assert.equal(res.json.servers.length, 1);
  assert.equal(res.json.servers[0].url, "/", "relative, so it works on any host");
  assert.deepEqual(operationsOf(res.json).map((o) => o.key).sort(), [...ROUTES].sort());
  assert.deepEqual(
    res.json.tags.map((tag: { name: string }) => tag.name),
    ["Sistema", "Autenticazione", "Media", "News (admin)", "News (pubbliche)"],
  );
  assert.deepEqual(res.json, JSON.parse(JSON.stringify(openApiSpec)));
});

test("the OpenAPI document is valid", async () => {
  // The parser dereferences the object it is given in place: hand it a copy.
  await SwaggerParser.validate(structuredClone(openApiSpec) as any);
});

test("every operation is complete and every admin route is guarded in the document", () => {
  const operations = operationsOf(openApiSpec);
  const declaredTags = new Set((openApiSpec.tags as { name: string }[]).map((tag) => tag.name));
  const operationIds = new Set<string>();

  for (const { key, path: pathName, op } of operations) {
    assert.ok(op.summary, `${key} has no summary`);
    assert.ok(op.description, `${key} has no description`);
    assert.ok(op.operationId, `${key} has no operationId`);
    assert.ok(!operationIds.has(op.operationId), `${key} repeats operationId ${op.operationId}`);
    operationIds.add(op.operationId);
    assert.equal(op.tags?.length, 1, `${key} must have exactly one tag`);
    assert.ok(declaredTags.has(op.tags[0]), `${key} uses the undeclared tag ${op.tags[0]}`);
    assert.ok(
      Object.keys(op.responses).some((code) => /^2\d\d$/.test(code)),
      `${key} documents no success status`,
    );

    // Each {name} in the path needs a path parameter, inline or from components.
    const parameters = (op.parameters ?? []).map((p: any) =>
      p.$ref ? (openApiSpec.components.parameters as Record<string, any>)[p.$ref.split("/").pop()!] : p,
    );
    for (const [, name] of pathName.matchAll(/\{(\w+)\}/g)) {
      assert.ok(
        parameters.some((p: any) => p.in === "path" && p.name === name && p.required === true),
        `${key} does not declare the path parameter ${name}`,
      );
    }

    const guarded = JSON.stringify(op.security ?? []).includes("bearerAuth");
    if (pathName.startsWith("/api/admin/") && !OPEN_ADMIN_ROUTES.includes(key)) {
      assert.ok(guarded, `${key} is an admin route and must use bearerAuth`);
      assert.ok(op.responses["401"], `${key} must document the 401 answer`);
    } else {
      assert.ok(!guarded, `${key} is open and must not ask for bearerAuth`);
    }
  }

  assert.deepEqual(Object.keys(openApiSpec.components.securitySchemes), ["bearerAuth"]);
  assert.deepEqual(openApiSpec.components.securitySchemes.bearerAuth, {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: openApiSpec.components.securitySchemes.bearerAuth.description,
  });
});

test("GET /docs and /docs/ serve the page, which loads its assets and has no inline script", async () => {
  for (const url of ["/docs", "/docs/"]) {
    const res = await request("GET", url);
    assert.equal(res.status, 200, url);
    assert.match(res.headers.get("content-type") ?? "", /^text\/html/, url);
    const html: string = res.json;
    assert.equal(typeof html, "string");
    assert.ok(html.includes("<title>Mateira API, documentazione</title>"), "Italian title");
    for (const asset of [
      "/docs/swagger-ui.css",
      "/docs/swagger-ui-bundle.js",
      "/docs/swagger-ui-standalone-preset.js",
      "/docs/swagger-init.js",
    ]) {
      assert.ok(html.includes(`"${asset}"`), `the page must load ${asset}`);
    }

    const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
    assert.equal(scripts.length, 3, "three script tags");
    for (const [, attributes, body] of scripts) {
      assert.match(attributes, /\ssrc="\/docs\/[\w.-]+\.js"/, "every script is an external file");
      assert.equal(body.trim(), "", "no inline script body");
    }
    assert.ok(!/<script\b(?![^>]*\bsrc=)/i.test(html), "no script tag without src");
    assert.ok(!/\son[a-z]+\s*=/i.test(html), "no inline event handler");
  }
});

test("each whitelisted asset is served from the installed package with its content type", async () => {
  for (const [name, contentType] of ASSETS) {
    const res = await rawGet(`/docs/${name}`);
    assert.equal(res.status, 200, name);
    assert.ok(String(res.headers["content-type"]).startsWith(contentType), `${name}: ${res.headers["content-type"]}`);
    assert.equal(res.headers["cache-control"], "public, max-age=3600", name);
    assert.equal(res.headers["x-content-type-options"], "nosniff", name);
    assert.ok(res.body.length > 0, `${name} is not empty`);
    assert.equal(res.body.length, fs.statSync(path.join(swaggerDir, name)).size, `${name} is the file of the package`);
  }
});

test("/docs/swagger-init.js is JavaScript that creates Swagger UI on the openapi document", async () => {
  const res = await request("GET", "/docs/swagger-init.js");
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") ?? "", /^application\/javascript/);
  const source: string = res.json;
  assert.equal(typeof source, "string");
  assert.ok(source.includes("preauthorizeApiKey"));
  assert.ok(source.includes("/api/admin/auth/login"));
  assert.ok(source.includes("/api/admin/auth/refresh"));
  assert.ok(source.includes("/openapi.json"));
  assert.ok(!source.includes("<script"));
});

/** Runs the init file the way the browser does, with a stand-in for Swagger UI that records what it is asked. */
function runInit(source: string): { config: any; authorized: [string, string][] } {
  const authorized: [string, string][] = [];
  const captured: { config?: any } = {};
  const SwaggerUIBundle = Object.assign(
    (config: any) => {
      captured.config = config;
      return { preauthorizeApiKey: (name: string, token: string) => void authorized.push([name, token]) };
    },
    { presets: { apis: "apis-preset" } },
  );
  vm.runInNewContext(source, {
    SwaggerUIBundle,
    SwaggerUIStandalonePreset: "standalone-preset",
    URL,
    location: { href: "http://localhost:4000/docs" },
  });
  return { config: captured.config, authorized };
}

test("the init file configures Swagger UI and authorizes after a successful login or refresh", async () => {
  const source: string = (await request("GET", "/docs/swagger-init.js")).json;
  const { config, authorized } = runInit(source);

  assert.equal(config.url, "/openapi.json");
  assert.equal(config.dom_id, "#swagger-ui");
  assert.deepEqual([...config.presets], ["apis-preset", "standalone-preset"]); // spread: the array comes from the vm realm
  assert.equal(config.deepLinking, true);
  assert.equal(config.displayRequestDuration, true);
  assert.equal(config.tryItOutEnabled, true);
  assert.equal(config.persistAuthorization, false);
  assert.equal(typeof config.responseInterceptor, "function");

  const intercept = (res: any) => {
    const before = authorized.length;
    assert.equal(config.responseInterceptor(res), res, "the response is always returned unchanged");
    return authorized.length - before;
  };
  const answer = (url: string, status: number, text: string) => ({ url, status, text, ok: status < 400 });
  const login = "http://localhost:4000/api/admin/auth/login";
  const token = JSON.stringify({ accessToken: "token-1", expiresIn: 3600 });

  assert.equal(intercept(answer(login, 200, token)), 1);
  assert.deepEqual(authorized.at(-1), ["bearerAuth", "token-1"]);

  assert.equal(intercept(answer("http://localhost:4000/api/admin/auth/refresh", 200, JSON.stringify({ accessToken: "token-2" }))), 1);
  assert.deepEqual(authorized.at(-1), ["bearerAuth", "token-2"]);

  assert.equal(intercept(answer("/api/admin/auth/login", 200, JSON.stringify({ accessToken: "token-3" }))), 1, "relative url");
  assert.deepEqual(authorized.at(-1), ["bearerAuth", "token-3"]);

  assert.equal(intercept(answer(login, 401, JSON.stringify({ error: "Invalid credentials" }))), 0, "failed login");
  assert.equal(intercept(answer(login, 429, token)), 0, "only status 200 counts");
  assert.equal(intercept(answer(login, 200, "<html>not json</html>")), 0, "text that is not json");
  assert.equal(intercept(answer(login, 200, JSON.stringify({ accessToken: "" }))), 0, "empty token");
  assert.equal(intercept(answer(login, 200, JSON.stringify({ user: {} }))), 0, "no token");
  assert.equal(intercept(answer(login, 200, "null")), 0, "json null");
  assert.equal(intercept(answer("http://localhost:4000/api/admin/auth/me", 200, token)), 0, "another route");
  assert.equal(intercept(answer("http://localhost:4000/openapi.json", 200, token)), 0, "the document itself");
  assert.equal(intercept({ status: 200 }), 0, "a response without url or text");
  assert.equal(authorized.length, 3);
});

test("anything else under /docs/ and path traversal answer the normal 404", async () => {
  const paths = [
    "/docs/nope.js",
    "/docs/index.html",
    "/docs/swagger-ui.css.map",
    "/docs/swagger-ui-bundle.js.map",
    "/docs/swagger-ui.css/",
    "/docs/swagger-ui.css%00",
    "/docs/SWAGGER-UI.CSS",
    "/docs/swagger%2dui.css",
    "/docs/__proto__",
    "/docs/constructor",
    "/docs/.env",
    "/docs//etc/passwd",
    "/docs/../package.json",
    "/docs/..%2fpackage.json",
    "/docs/..%2Fpackage.json",
    "/docs/%2e%2e%2fpackage.json",
    "/docs/%2e%2e/package.json",
    "/docs/%2E%2E%5Cpackage.json",
    "/docs/..\\package.json",
    "/docs/swagger-ui.css/../../package.json",
    "/docs/..%2f..%2f.env",
  ];
  for (const rawPath of paths) {
    const res = await rawGet(rawPath);
    const body = res.body.toString("utf8");
    assert.equal(res.status, 404, `${rawPath}: ${res.status}`);
    assert.match(String(res.headers["content-type"]), /^application\/json/, rawPath);
    assert.deepEqual(JSON.parse(body), { error: "Not found" }, rawPath);
  }
});

test("only GET is served", async () => {
  for (const url of ["/docs", "/openapi.json", "/docs/swagger-ui.css", "/docs/swagger-init.js"]) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const res = await request(method, url);
      assert.equal(res.status, 404, `${method} ${url}`);
    }
  }
});

test("with the documentation disabled the handler leaves every path to the 404", async () => {
  // Any use of the response fails the test: a handler that declines must not touch it.
  const untouched = new Proxy(
    {},
    {
      get() {
        throw new Error("the handler touched the response");
      },
      set() {
        throw new Error("the handler touched the response");
      },
    },
  ) as ServerResponse;

  for (const pathname of ["/docs", "/docs/", "/docs/swagger-ui.css", "/docs/swagger-init.js", "/openapi.json"]) {
    const req = { method: "GET" } as IncomingMessage;
    assert.equal(await handleDocs(req, untouched, pathname, false), false, pathname);
  }
});

test("the enabled handler answers GET only, the disabled one writes nothing", async () => {
  // The same stand-in response on both sides: the enabled handler writes to it, the disabled one does not.
  const writes: string[] = [];
  const recorder = (): ServerResponse =>
    ({
      statusCode: 0,
      setHeader: () => undefined,
      end: (data?: unknown) => void writes.push(String(data ?? "")),
    }) as unknown as ServerResponse;
  const req = { method: "GET" } as IncomingMessage;

  assert.equal(await handleDocs(req, recorder(), "/openapi.json", true), true);
  assert.equal(writes.length, 1);
  assert.equal(JSON.parse(writes[0]).openapi, "3.0.3");

  assert.equal(await handleDocs({ method: "POST" } as IncomingMessage, recorder(), "/openapi.json", true), false);
  assert.equal(await handleDocs(req, recorder(), "/openapi.json", false), false);
  assert.equal(writes.length, 1, "the disabled handler wrote nothing");
});

// The documented statuses of a request that carries no token, no body and no cookie.
const BARE_REQUEST_STATUS: Record<string, number> = {
  "GET /api/health": 200,
  "POST /api/admin/auth/login": 400,
  "POST /api/admin/auth/refresh": 401,
  "POST /api/admin/auth/logout": 204,
  "GET /api/public/news": 200,
};

test("every documented route exists on the server and the admin ones are guarded", async () => {
  const uuid = "11111111-1111-4111-8111-111111111111";

  for (const { key, method, path: pathName, op } of operationsOf(openApiSpec)) {
    const url = pathName.replace("{id}", uuid).replace("{slug}", "no-such-slug");
    const res = await request(method, url);
    const documented = Object.keys(op.responses);

    assert.ok(![405, 500].includes(res.status), `${key} answered ${res.status}: ${JSON.stringify(res.json)}`);
    assert.ok(documented.includes(String(res.status)), `${key} answered ${res.status}, which is not documented`);

    if (JSON.stringify(op.security ?? []).includes("bearerAuth")) {
      assert.equal(res.status, 401, `${key} must answer 401 without a token`);
      assert.deepEqual(res.json, { error: "Unauthorized" }, key);
    } else if (key in BARE_REQUEST_STATUS) {
      assert.equal(res.status, BARE_REQUEST_STATUS[key], key);
    } else {
      // The only other open route is the public news detail: an unknown slug is a json 404.
      assert.equal(key, "GET /api/public/news/{slug}");
      assert.equal(res.status, 404);
      assert.deepEqual(res.json, { error: "Not found" });
    }
  }
});
