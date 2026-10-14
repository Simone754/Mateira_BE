import { after, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import vm from "node:vm";

import SwaggerParser from "@apidevtools/swagger-parser";
// Not a dependency of the project: it is the validator swagger-parser itself uses, so it is always installed next to it.
import Ajv from "ajv";

import { openApiSpec } from "../src/modules/docs/openapi";
import { handleDocs } from "../src/modules/docs/routes";
import {
  CARD_TEXT_MAX,
  CARD_TITLE_MAX,
  CTA_TEXT_MAX,
  CTA_TITLE_MAX,
  FEATURED_ITEMS_MAX,
  FEATURED_TITLE_MAX,
  HERO_TEXT_MAX,
  HERO_TITLE_MAX,
  LABEL_MAX,
  TICKER_ITEMS_MAX,
  TICKER_TEXT_MAX,
} from "../src/modules/home/service";
import { newObjectKey } from "../src/modules/media/service";
import { prisma } from "../src/plugins/prisma";
import { closeDb, resetDb, startTestServer, type Requester, type TestResponse } from "./helpers/app";
import { ADMIN_EMAIL, ADMIN_PASSWORD, loginAsAdmin, refreshPair } from "./helpers/auth";

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
  "GET /api/public/home",
  "GET /api/admin/home-blocks",
  "POST /api/admin/home-blocks",
  "PUT /api/admin/home-blocks/order",
  "GET /api/admin/home-blocks/{id}",
  "PATCH /api/admin/home-blocks/{id}",
  "DELETE /api/admin/home-blocks/{id}",
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
    ["Sistema", "Autenticazione", "Media", "News (admin)", "News (pubbliche)", "Home (admin)", "Home (pubblica)"],
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

/** Follows a local $ref (#/components/...) in the document. */
function resolved(node: any): any {
  let current = node;
  while (current && typeof current.$ref === "string") {
    current = current.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((value: any, key: string) => value?.[key], openApiSpec);
  }
  return current;
}

test("the list filters are not prefilled: no example or default on category and status", () => {
  const checked: string[] = [];
  for (const { key, op } of operationsOf(openApiSpec)) {
    for (const entry of op.parameters ?? []) {
      const parameter = resolved(entry);
      if (parameter.in !== "query" || !["category", "status"].includes(parameter.name)) continue;
      checked.push(`${key} ${parameter.name}`);

      // Swagger UI pre-selects an example or a default of the parameter or of its schema, so Execute would send it.
      const schema = resolved(parameter.schema);
      const nodes: [string, any][] = [
        ["parameter", parameter],
        ["schema", schema],
        ...((schema.allOf ?? []) as any[]).map((member): [string, any] => ["schema member", resolved(member)]),
      ];
      for (const [label, node] of nodes) {
        for (const keyword of ["example", "examples", "default"]) {
          assert.equal(node[keyword], undefined, `${key}: the ${label} of ${parameter.name} has ${keyword}`);
        }
      }
    }
  }
  assert.deepEqual(checked.sort(), [
    "GET /api/admin/news category",
    "GET /api/admin/news status",
    "GET /api/public/news category",
  ]);

  // The paging parameters keep their documented defaults.
  const limit = openApiSpec.paths["/api/public/news"].get.parameters.find((p: any) => p.name === "limit");
  assert.equal(resolved(limit).schema.default, 12);
  assert.equal(resolved(openApiSpec.components.parameters.Page).schema.default, 1);
});

test("the news request examples still carry a concrete category and status", () => {
  const categories = openApiSpec.components.schemas.NewsCategory.enum as string[];
  const statuses = openApiSpec.components.schemas.ContentStatus.enum as string[];
  const content: any = openApiSpec.paths["/api/admin/news"].post.requestBody.content["application/json"];
  const examples = content.examples;
  assert.ok(categories.includes(examples.completa.value.category));
  assert.ok(statuses.includes(examples.completa.value.status));
  assert.ok(categories.includes(examples.minima.value.category));
});

test("every nullable schema declares its type, as OpenAPI 3.0.3 requires", () => {
  const offenders: string[] = [];
  const walk = (node: any, where: string) => {
    if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${where}/${i}`));
    if (!node || typeof node !== "object") return;
    if (node.nullable === true && typeof node.type !== "string") offenders.push(where);
    for (const [name, child] of Object.entries(node)) walk(child, `${where}/${name}`);
  };
  walk(openApiSpec, "#");
  assert.deepEqual(offenders, []);
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
  "GET /api/public/home": 200,
};

// An additional guard only: the admin routers answer 401 before they look at the path, so this does not prove that a
// route exists (the tests below do). It proves that none of the admin routes is open.
test("every documented admin route is guarded and the open ones answer as documented", async () => {
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

/** The answer of a documented operation: never 405 or 500, and one of the statuses the document lists for it. */
function assertDocumentedAnswer(key: string, op: any, status: number): void {
  assert.ok(status !== 405 && status !== 500, `${key} answered ${status}`);
  const documented = Object.keys(op.responses);
  assert.ok(documented.includes(String(status)), `${key} answered ${status}, documented: ${documented.join(", ")}`);
}

type Context = {
  token: string;
  cookie: string;
  mediaId: string;
  newsId: string;
  slug: string;
  /** A published CTA block made before the calls. */
  blockId: string;
  /** The FEATURED block the POST call creates. */
  createdBlockId: string;
};

type Call = {
  key: string;
  /** The exact status of the happy path. */
  status: number;
  send: (request: Requester, ctx: Context) => Promise<TestResponse>;
  then?: (res: TestResponse, ctx: Context) => void;
  /** The best-effort delete of the stored file fails (there is no storage in tests) and logs a warning. */
  logsWarning?: boolean;
};

// One real call for every documented operation, in an order that works: the logout and the deletes come last.
const CALLS: Call[] = [
  { key: "GET /api/health", status: 200, send: (r) => r("GET", "/api/health") },
  {
    key: "POST /api/admin/auth/login",
    status: 200,
    send: (r) => r("POST", "/api/admin/auth/login", { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } }),
    then: (res, ctx) => {
      ctx.cookie = refreshPair(res.setCookie);
    },
  },
  {
    key: "POST /api/admin/auth/refresh",
    status: 200,
    send: (r, ctx) => r("POST", "/api/admin/auth/refresh", { cookie: ctx.cookie }),
    then: (res, ctx) => {
      ctx.cookie = refreshPair(res.setCookie);
      ctx.token = res.json.accessToken;
    },
  },
  { key: "GET /api/admin/auth/me", status: 200, send: (r, ctx) => r("GET", "/api/admin/auth/me", { token: ctx.token }) },
  {
    key: "POST /api/admin/media/presign",
    status: 200,
    send: (r, ctx) =>
      r("POST", "/api/admin/media/presign", {
        token: ctx.token,
        body: { contentType: "image/png", size: 1234, alt: "Veduta del porto" },
      }),
  },
  { key: "GET /api/admin/media", status: 200, send: (r, ctx) => r("GET", "/api/admin/media", { token: ctx.token }) },
  {
    key: "PATCH /api/admin/media/{id}",
    status: 200,
    send: (r, ctx) => r("PATCH", `/api/admin/media/${ctx.mediaId}`, { token: ctx.token, body: { alt: "Il porto al tramonto" } }),
  },
  { key: "GET /api/admin/news", status: 200, send: (r, ctx) => r("GET", "/api/admin/news", { token: ctx.token }) },
  {
    key: "POST /api/admin/news",
    status: 201,
    send: (r, ctx) =>
      r("POST", "/api/admin/news", {
        token: ctx.token,
        body: { title: "Creata dal test", date: "2026-10-02", category: "RICERCA", body: "Testo della news." },
      }),
  },
  {
    key: "GET /api/admin/news/{id}",
    status: 200,
    send: (r, ctx) => r("GET", `/api/admin/news/${ctx.newsId}`, { token: ctx.token }),
    then: (res, ctx) => assert.equal(res.json.slug, ctx.slug),
  },
  {
    key: "PATCH /api/admin/news/{id}",
    status: 200,
    send: (r, ctx) => r("PATCH", `/api/admin/news/${ctx.newsId}`, { token: ctx.token, body: { title: "Titolo modificato" } }),
  },
  {
    key: "GET /api/public/news",
    status: 200,
    send: (r) => r("GET", "/api/public/news"),
    then: (res, ctx) => assert.ok(res.json.items.some((item: { slug: string }) => item.slug === ctx.slug)),
  },
  {
    key: "GET /api/public/news/{slug}",
    status: 200,
    send: (r, ctx) => r("GET", `/api/public/news/${ctx.slug}`),
  },
  {
    key: "GET /api/public/home",
    status: 200,
    send: (r) => r("GET", "/api/public/home"),
    then: (res, ctx) => assert.ok(res.json.blocks.some((block: { id: string }) => block.id === ctx.blockId)),
  },
  {
    key: "GET /api/admin/home-blocks",
    status: 200,
    send: (r, ctx) => r("GET", "/api/admin/home-blocks", { token: ctx.token }),
    then: (res, ctx) => assert.ok(res.json.blocks.some((block: { id: string }) => block.id === ctx.blockId)),
  },
  {
    key: "POST /api/admin/home-blocks",
    status: 201,
    send: (r, ctx) =>
      r("POST", "/api/admin/home-blocks", {
        token: ctx.token,
        body: {
          type: "FEATURED",
          content: { title: "Creato dal test", items: [{ title: "Scheda", href: "/news", imageId: ctx.mediaId }] },
          status: "PUBLISHED",
        },
      }),
    then: (res, ctx) => {
      ctx.createdBlockId = res.json.id;
      assert.equal(res.json.content.items[0].image.id, ctx.mediaId);
    },
  },
  {
    key: "GET /api/admin/home-blocks/{id}",
    status: 200,
    send: (r, ctx) => r("GET", `/api/admin/home-blocks/${ctx.blockId}`, { token: ctx.token }),
    then: (res, ctx) => assert.equal(res.json.id, ctx.blockId),
  },
  {
    key: "PATCH /api/admin/home-blocks/{id}",
    status: 200,
    send: (r, ctx) =>
      r("PATCH", `/api/admin/home-blocks/${ctx.blockId}`, {
        token: ctx.token,
        body: { content: { title: "Titolo modificato", cta: { label: "Vai", href: "/news" } } },
      }),
    then: (res) => assert.equal(res.json.content.title, "Titolo modificato"),
  },
  {
    key: "PUT /api/admin/home-blocks/order",
    status: 200,
    send: async (r, ctx) => {
      const list = await r("GET", "/api/admin/home-blocks", { token: ctx.token });
      const ids: string[] = list.json.blocks.map((block: { id: string }) => block.id).reverse();
      return r("PUT", "/api/admin/home-blocks/order", { token: ctx.token, body: { ids } });
    },
    then: (res, ctx) => assert.deepEqual(res.json.blocks.map((block: { id: string }) => block.id), [ctx.createdBlockId, ctx.blockId]),
  },
  { key: "POST /api/admin/auth/logout", status: 204, send: (r, ctx) => r("POST", "/api/admin/auth/logout", { cookie: ctx.cookie }) },
  {
    key: "DELETE /api/admin/news/{id}",
    status: 204,
    send: (r, ctx) => r("DELETE", `/api/admin/news/${ctx.newsId}`, { token: ctx.token }),
  },
  {
    key: "DELETE /api/admin/home-blocks/{id}",
    status: 204,
    send: (r, ctx) => r("DELETE", `/api/admin/home-blocks/${ctx.blockId}`, { token: ctx.token }),
  },
  {
    key: "DELETE /api/admin/media/{id}",
    status: 204,
    send: (r, ctx) => r("DELETE", `/api/admin/media/${ctx.mediaId}`, { token: ctx.token }),
    logsWarning: true,
  },
];

test("every documented operation answers on the real router with a status the document lists", async () => {
  await resetDb();
  const { token, cookie } = await loginAsAdmin(request);
  const media = await prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey("image/png"), mimeType: "image/png", size: 1234, alt: "Veduta del porto" },
  });
  const news = await prisma.news.create({
    data: {
      slug: "notizia-di-prova",
      title: "Notizia di prova",
      date: new Date("2026-10-01T09:00:00Z"),
      category: "MATEIRA",
      body: "Testo della notizia di prova.",
      status: "PUBLISHED",
      publishedAt: new Date("2026-10-01T09:00:00Z"),
      imageId: media.id,
    },
  });
  const block = await prisma.homeBlock.create({
    data: {
      type: "CTA",
      position: 0,
      content: { title: "Invito di prova", text: null, cta: { label: "Scopri", href: "/come-lavoriamo" } },
      status: "PUBLISHED",
      publishedAt: new Date("2026-10-01T09:00:00Z"),
    },
  });
  const ctx: Context = {
    token,
    cookie,
    mediaId: media.id,
    newsId: news.id,
    slug: news.slug,
    blockId: block.id,
    createdBlockId: "",
  };

  const documented = new Map(operationsOf(openApiSpec).map((o) => [o.key, o.op]));
  assert.deepEqual(CALLS.map((call) => call.key).sort(), [...documented.keys()].sort(), "one call for every documented operation");

  for (const call of CALLS) {
    // Only the call known to log gets its warning silenced: any other output stays visible.
    const warn = call.logsWarning ? mock.method(console, "warn", () => {}) : null;
    let res: TestResponse;
    try {
      res = await call.send(request, ctx);
    } finally {
      warn?.mock.restore();
    }
    assertDocumentedAnswer(call.key, documented.get(call.key), res.status);
    assert.equal(res.status, call.status, `${call.key}: ${JSON.stringify(res.json)}`);
    call.then?.(res, ctx);
  }
});

test("an unknown id or slug answers 404 on every route that takes one", async () => {
  const { token } = await loginAsAdmin(request);
  const unknownId = "22222222-2222-4222-8222-222222222222";
  let checked = 0;

  for (const { key, method, path: pathName, op } of operationsOf(openApiSpec)) {
    if (!/\{(id|slug)\}/.test(pathName)) continue;
    const url = pathName.replace("{id}", unknownId).replace("{slug}", "no-such-slug");
    const patchBody = pathName.includes("/media/")
      ? { alt: "Testo" }
      : pathName.includes("/home-blocks/")
        ? { status: "PUBLISHED" }
        : { title: "Titolo" };
    const body = method === "PATCH" ? patchBody : undefined;
    const res = await request(method, url, { token, body });
    assertDocumentedAnswer(key, op, res.status);
    assert.equal(res.status, 404, key);
    assert.deepEqual(res.json, { error: "Not found" }, key);
    checked++;
  }
  assert.equal(checked, 9);
});

test("the documented Home request examples are accepted by the real router", async () => {
  await resetDb();
  const { token } = await loginAsAdmin(request);
  const post: any = (openApiSpec.paths as any)["/api/admin/home-blocks"].post;
  const examples: Record<string, { value: any }> = post.requestBody.content["application/json"].examples;
  assert.deepEqual(
    Object.values(examples)
      .map((example) => example.value.type)
      .sort(),
    ["CTA", "FEATURED", "HERO", "TICKER"],
    "one example for every type of block",
  );

  // The FEATURED example points at a media: register one with that id, as the reader of the document would have.
  const imageId: string = examples.featured.value.content.items[0].imageId;
  await prisma.media.create({
    data: { id: imageId, bucket: "mateira-media", objectKey: newObjectKey("image/png"), mimeType: "image/png", alt: "Esempio" },
  });
  for (const [name, example] of Object.entries(examples)) {
    const res = await request("POST", "/api/admin/home-blocks", { token, body: example.value });
    assert.equal(res.status, 201, `${name}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.type, example.value.type, name);
  }

  const cta = (await request("POST", "/api/admin/home-blocks", { token, body: examples.cta.value })).json;
  const patch: any = (openApiSpec.paths as any)["/api/admin/home-blocks/{id}"].patch;
  const patchExamples: Record<string, { value: unknown }> = patch.requestBody.content["application/json"].examples;
  assert.ok(Object.keys(patchExamples).length >= 3);
  for (const [name, example] of Object.entries(patchExamples)) {
    const res = await request("PATCH", `/api/admin/home-blocks/${cta.id}`, { token, body: example.value });
    assert.equal(res.status, 200, `${name}: ${JSON.stringify(res.json)}`);
  }

  // The order example lists ids that do not exist: the real router refuses it with the documented 400.
  const order: any = (openApiSpec.paths as any)["/api/admin/home-blocks/order"].put;
  const reorder = await request("PUT", "/api/admin/home-blocks/order", {
    token,
    body: order.requestBody.content["application/json"].example,
  });
  assert.equal(reorder.status, 400);
  assert.ok(Object.keys(order.responses).includes("400"));
});

test("no schema pairs nullable with allOf: in OpenAPI 3.0.3 that does not accept null", () => {
  // `{ nullable: true, allOf: [{ $ref }] }` still requires whatever the referenced schema requires, null included.
  const offenders: string[] = [];
  const walk = (node: any, where: string) => {
    if (Array.isArray(node)) return node.forEach((item, i) => walk(item, `${where}/${i}`));
    if (!node || typeof node !== "object") return;
    if (node.nullable === true && "allOf" in node) offenders.push(where);
    for (const [name, child] of Object.entries(node)) walk(child, `${where}/${name}`);
  };
  walk(openApiSpec, "#");
  assert.deepEqual(offenders, []);
});

test("the Home request schemas describe exactly what the code accepts", () => {
  const schemas: any = openApiSpec.components.schemas;

  // An empty imageId means "no image" and a uuid may carry spaces or capitals: a uuid format would be a false promise.
  const imageId = schemas.HomeFeaturedItemRequest.properties.imageId;
  assert.equal(imageId.format, undefined);
  assert.equal(imageId.type, "string");
  assert.equal(imageId.nullable, true);

  // A reorder with a repeated id is a 400, and a patch needs at least one of its two fields.
  assert.equal(schemas.HomeBlockOrderRequest.properties.ids.uniqueItems, true);
  assert.equal(schemas.HomeBlockUpdateRequest.minProperties, 1);
  assert.equal(schemas.HomeBlockCreateRequest.minProperties, undefined);

  // A block created while the order is written is kept, but where it ends up is not promised.
  const order: any = (openApiSpec.paths as any)["/api/admin/home-blocks/order"].put;
  assert.match(order.description, /non è garantita/);
  assert.ok(!/resta dopo gli altri|resta in fondo/.test(order.description));
});

/** Compiles the schema the document gives to the answer `status` of an operation; its references point into the document. */
function validatorFor(ajv: Ajv, pathName: string, method: string, status: string) {
  const schema = (openApiSpec.paths as any)[pathName][method].responses[status].content["application/json"].schema;
  assert.equal(typeof schema.$ref, "string", `${method} ${pathName} ${status} answers with a named schema`);
  return ajv.compile({ $ref: `openapi${schema.$ref}` });
}

test("real Home and news answers, null parts included, match the documented response schemas", async () => {
  await resetDb();
  const { token } = await loginAsAdmin(request);
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  ajv.addSchema(structuredClone(openApiSpec), "openapi");

  const conforms = (label: string, validate: ReturnType<typeof validatorFor>, value: unknown) => {
    assert.ok(validate(value), `${label} does not match the document: ${ajv.errorsText(validate.errors)}\n${JSON.stringify(value)}`);
  };
  const send = (method: string, path: string, body?: unknown) => request(method, path, { token, body });

  const image = await prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey("image/png"), mimeType: "image/png", alt: "Il porto" },
  });
  const gone = await prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey("image/png"), mimeType: "image/png", alt: "Sparita" },
  });

  const createBlock = validatorFor(ajv, "/api/admin/home-blocks", "post", "201");
  const blockIds: string[] = [];
  const blocks = [
    // text and secondaryCta absent: both come back as null
    { type: "HERO", content: { title: "Solo il titolo", primaryCta: { label: "Vai", href: "/x" } } },
    {
      type: "HERO",
      content: {
        title: "Completo",
        text: "Testo",
        primaryCta: { label: "Vai", href: "/x" },
        secondaryCta: { label: "Altro", href: "https://example.org/" },
      },
    },
    { type: "TICKER", content: { items: [{ text: "Con link", href: "/x" }, { text: "Senza link" }] } },
    { type: "CTA", content: { title: "Invito", cta: { label: "Vai", href: "/x" } } },
    {
      type: "FEATURED",
      content: {
        title: "Schede",
        items: [
          { title: "Con immagine", text: "Testo", href: "/a", imageId: image.id },
          { title: "Senza immagine", href: "/b" },
          { title: "Immagine che sparirà", href: "/c", imageId: gone.id },
        ],
      },
    },
  ];
  for (const block of blocks) {
    const res = await send("POST", "/api/admin/home-blocks", { ...block, status: "PUBLISHED" });
    assert.equal(res.status, 201, JSON.stringify(res.json));
    conforms(`POST ${block.type}`, createBlock, res.json);
    blockIds.push(res.json.id);
  }
  await prisma.media.delete({ where: { id: gone.id } });

  const publicHome = await send("GET", "/api/public/home");
  conforms("GET /api/public/home", validatorFor(ajv, "/api/public/home", "get", "200"), publicHome.json);
  const cards = publicHome.json.blocks.find((block: any) => block.type === "FEATURED").content.items;
  assert.deepEqual(cards.map((card: any) => card.image === null), [false, true, true], "the case under test is really there");
  assert.equal(publicHome.json.blocks[0].content.secondaryCta, null, "and so is a null secondaryCta");

  const list = await send("GET", "/api/admin/home-blocks");
  conforms("GET /api/admin/home-blocks", validatorFor(ajv, "/api/admin/home-blocks", "get", "200"), list.json);
  const getOne = validatorFor(ajv, "/api/admin/home-blocks/{id}", "get", "200");
  for (const id of blockIds) conforms("GET /api/admin/home-blocks/{id}", getOne, (await send("GET", `/api/admin/home-blocks/${id}`)).json);

  const patched = await send("PATCH", `/api/admin/home-blocks/${blockIds[1]}`, { status: "DRAFT" });
  conforms("PATCH /api/admin/home-blocks/{id}", validatorFor(ajv, "/api/admin/home-blocks/{id}", "patch", "200"), patched.json);
  const reordered = await send("PUT", "/api/admin/home-blocks/order", { ids: [...blockIds].reverse() });
  assert.equal(reordered.status, 200, JSON.stringify(reordered.json));
  conforms("PUT /api/admin/home-blocks/order", validatorFor(ajv, "/api/admin/home-blocks/order", "put", "200"), reordered.json);

  // News: one with no image (null), one with an image and an attachment.
  const plain = await send("POST", "/api/admin/news", {
    title: "Senza immagine",
    date: "2026-10-01",
    category: "MATEIRA",
    body: "Testo.",
    status: "PUBLISHED",
  });
  assert.equal(plain.status, 201, JSON.stringify(plain.json));
  assert.equal(plain.json.image, null, "the case under test is really there");
  const illustrated = await send("POST", "/api/admin/news", {
    title: "Con immagine",
    date: "2026-10-02",
    category: "RICERCA",
    body: "Testo.",
    status: "PUBLISHED",
    imageId: image.id,
    attachmentIds: [image.id],
    externalLinks: [{ label: "Sito", url: "https://example.org/" }],
  });
  assert.equal(illustrated.status, 201, JSON.stringify(illustrated.json));
  conforms("POST /api/admin/news", validatorFor(ajv, "/api/admin/news", "post", "201"), plain.json);
  conforms("POST /api/admin/news (with image)", validatorFor(ajv, "/api/admin/news", "post", "201"), illustrated.json);
  conforms("GET /api/admin/news", validatorFor(ajv, "/api/admin/news", "get", "200"), (await send("GET", "/api/admin/news")).json);
  conforms("GET /api/admin/news/{id}", validatorFor(ajv, "/api/admin/news/{id}", "get", "200"), (await send("GET", `/api/admin/news/${plain.json.id}`)).json);
  const publicNews = await send("GET", "/api/public/news");
  conforms("GET /api/public/news", validatorFor(ajv, "/api/public/news", "get", "200"), publicNews.json);
  conforms(
    "GET /api/public/news/{slug}",
    validatorFor(ajv, "/api/public/news/{slug}", "get", "200"),
    (await send("GET", `/api/public/news/${plain.json.slug}`)).json,
  );

  // The check can fail: a block without its position, or with a null where the document wants an object, is refused.
  const adminBlock = validatorFor(ajv, "/api/admin/home-blocks/{id}", "get", "200");
  const { position, ...withoutPosition } = (await send("GET", `/api/admin/home-blocks/${blockIds[0]}`)).json;
  assert.ok(position !== undefined);
  assert.equal(adminBlock(withoutPosition), false);
  const brokenHero = (await send("GET", `/api/admin/home-blocks/${blockIds[0]}`)).json;
  brokenHero.content.primaryCta = null;
  assert.equal(adminBlock(brokenHero), false);
});

test("the limits written in the Home schemas are the ones the code enforces", () => {
  const schemas: any = openApiSpec.components.schemas;
  assert.equal(schemas.HomeCta.properties.label.maxLength, LABEL_MAX);
  assert.equal(schemas.HomeHeroContent.properties.title.maxLength, HERO_TITLE_MAX);
  assert.equal(schemas.HomeHeroContent.properties.text.maxLength, HERO_TEXT_MAX);
  assert.equal(schemas.HomeTickerContent.properties.items.maxItems, TICKER_ITEMS_MAX);
  assert.equal(schemas.HomeTickerContent.properties.items.minItems, 1);
  assert.equal(schemas.HomeTickerItem.properties.text.maxLength, TICKER_TEXT_MAX);
  assert.equal(schemas.HomeCtaContent.properties.title.maxLength, CTA_TITLE_MAX);
  assert.equal(schemas.HomeCtaContent.properties.text.maxLength, CTA_TEXT_MAX);
  assert.equal(schemas.HomeFeaturedContentRequest.properties.title.maxLength, FEATURED_TITLE_MAX);
  assert.equal(schemas.HomeFeaturedContentRequest.properties.items.maxItems, FEATURED_ITEMS_MAX);
  assert.equal(schemas.HomeFeaturedContentRequest.properties.items.minItems, 1);
  assert.equal(schemas.HomeFeaturedItemRequest.properties.title.maxLength, CARD_TITLE_MAX);
  assert.equal(schemas.HomeFeaturedItemRequest.properties.text.maxLength, CARD_TEXT_MAX);
  assert.deepEqual(schemas.HomeBlockType.enum, ["HERO", "TICKER", "CTA", "FEATURED"]);
});

test("the check can fail: a route that does not exist answers 404 and is not in the document", async () => {
  const { token } = await loginAsAdmin(request);
  const documented = new Map(operationsOf(openApiSpec).map((o) => [o.key, o.op]));
  const uuid = "11111111-1111-4111-8111-111111111111";

  // With a token the missing routes fall through to the 404 of the app...
  const put = await request("PUT", "/api/admin/news", { token, body: {} });
  const deeper = await request("GET", `/api/admin/news/${uuid}/deeper`, { token });
  assert.equal(put.status, 404);
  assert.equal(deeper.status, 404);
  assert.ok(!documented.has("PUT /api/admin/news"));
  assert.ok(![...documented.keys()].some((key) => key.includes("/deeper")));

  // ...and that answer is refused for an operation that lists no 404, which is how a vanished route would show.
  const list = documented.get("GET /api/admin/news");
  assert.equal(list.responses["404"], undefined);
  assert.throws(() => assertDocumentedAnswer("GET /api/admin/news", list, put.status));
  assert.throws(() => assertDocumentedAnswer("GET /api/admin/news", list, 405));
  assert.throws(() => assertDocumentedAnswer("GET /api/admin/news", list, 500));

  // Without a token the same missing routes answer 401: the unauthenticated check cannot tell them from real ones.
  assert.equal((await request("PUT", "/api/admin/news")).status, 401);
  assert.equal((await request("GET", `/api/admin/news/${uuid}/deeper`)).status, 401);
});
