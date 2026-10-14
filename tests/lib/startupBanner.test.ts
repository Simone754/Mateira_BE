import { test } from "node:test";
import assert from "node:assert/strict";

import { formatStartupBanner, type OpenApiLike } from "../../src/lib/startupBanner";
import { openApiSpec } from "../../src/modules/docs/openapi";

const BASE_URL = "http://localhost:4000";
const METHODS = ["get", "post", "put", "patch", "delete"] as const;

/** The operations of the real document, read independently of the code under test. */
function documentedOperations(): { method: string; path: string; admin: boolean }[] {
  const operations: { method: string; path: string; admin: boolean }[] = [];
  for (const [path, item] of Object.entries(openApiSpec.paths)) {
    for (const method of METHODS) {
      const operation = (item as Record<string, { security?: unknown[] } | undefined>)[method];
      if (operation) operations.push({ method: method.toUpperCase(), path, admin: (operation.security?.length ?? 0) > 0 });
    }
  }
  return operations;
}

test("banner with the real spec starts with the base URL and lists the docs addresses", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: openApiSpec });
  const lines = banner.split("\n");

  assert.equal(lines[0], "Mateira API in ascolto su http://localhost:4000");
  assert.ok(lines.includes("Documentazione"));
  assert.ok(banner.includes("http://localhost:4000/docs"));
  assert.ok(banner.includes("http://localhost:4000/openapi.json"));
});

test("banner is plain ASCII with no colors, no carriage returns and no trailing newline", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: openApiSpec });

  assert.match(banner, /^[\x20-\x7e\n]*$/);
  assert.ok(!banner.endsWith("\n"));
  assert.ok(!banner.split("\n").some((line) => line !== line.trimEnd()), "no line has trailing whitespace");
});

test("banner counts every documented operation and prints each path with its method", () => {
  const operations = documentedOperations();
  assert.ok(operations.length > 0);

  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: openApiSpec });
  const lines = banner.split("\n");

  assert.ok(lines.includes(`Rotte (${operations.length})`));
  for (const { method, path } of operations) {
    assert.ok(findRouteLine(lines, method, path), `${method} ${path} should have its own line`);
  }
  const routeLines = lines.filter((line) => /^ {4}\S/.test(line));
  assert.equal(routeLines.length, operations.length);
});

test("only the operations that need the token carry the (admin) marker", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: openApiSpec });
  const lines = banner.split("\n");

  const admin = documentedOperations().filter((operation) => operation.admin);
  const open = documentedOperations().filter((operation) => !operation.admin);
  assert.ok(admin.length > 0 && open.length > 0);

  for (const { method, path } of admin) {
    const line = findRouteLine(lines, method, path);
    assert.ok(line?.endsWith("(admin)"), `${method} ${path} should be marked (admin)`);
  }
  for (const { method, path } of open) {
    const line = findRouteLine(lines, method, path);
    assert.ok(line && !line.includes("(admin)"), `${method} ${path} should not be marked (admin)`);
  }

  assert.ok(lines.some((line) => /^ {4}GET +\/api\/health$/.test(line)), "GET /api/health is listed without a marker");
  assert.ok(lines.some((line) => /^ {4}GET +\/api\/public\/news$/.test(line)));
  assert.ok(lines.some((line) => /^ {4}GET +\/api\/public\/news\/\{slug\}$/.test(line)));
});

test("the (admin) markers line up in one column", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: openApiSpec });
  const columns = new Set(
    banner
      .split("\n")
      .filter((line) => line.startsWith("    ") && line.endsWith("(admin)")) // route lines, not the "News (admin)" heading
      .map((line) => line.indexOf("(admin)")),
  );

  assert.equal(columns.size, 1);
});

test("groups follow the order of the top-level tags of the spec", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: openApiSpec });
  const lines = banner.split("\n");

  const positions = openApiSpec.tags.map((tag) => lines.indexOf(`  ${tag.name}`));
  assert.ok(positions.every((position) => position > 0), "every tag has a heading");
  assert.deepEqual([...positions].sort((a, b) => a - b), positions);
});

test("grouping, ordering, unlisted tags and untagged operations on a hand-made spec", () => {
  const spec: OpenApiLike = {
    tags: [{ name: "B" }, { name: "A" }, { name: "Vuoto" }],
    paths: {
      "/one": {
        delete: { tags: ["A"], security: [{ bearerAuth: [] }] },
        get: { tags: ["B"], summary: "Has a summary" },
      },
      "/two": {
        post: { tags: ["A"] },
        get: { tags: ["A", "B"] },
      },
      "/zzz/long": { get: {} },
      "/other": { put: { tags: ["Z"], security: [] } },
    },
  };

  const banner = formatStartupBanner({ baseUrl: "http://x:1", docsEnabled: true, spec });

  assert.equal(
    banner,
    [
      "Mateira API in ascolto su http://x:1",
      "",
      "Documentazione",
      "  Swagger UI   http://x:1/docs",
      "  OpenAPI      http://x:1/openapi.json",
      "",
      "Rotte (6)",
      "  B",
      "    GET     /one",
      "  A",
      "    DELETE  /one       (admin)",
      "    GET     /two",
      "    POST    /two",
      "  Z",
      "    PUT     /other",
      "  Altre",
      "    GET     /zzz/long",
    ].join("\n"),
  );
});

test("a spec without top-level tags still lists every operation, grouped by first appearance", () => {
  const spec: OpenApiLike = {
    paths: {
      "/b": { get: { tags: ["Second"] } },
      "/a": { get: { tags: ["First"] }, post: { tags: ["Second"] } },
    },
  };

  const lines = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec }).split("\n");

  assert.deepEqual(lines.slice(lines.indexOf("Rotte (3)")), [
    "Rotte (3)",
    "  Second",
    "    GET     /b",
    "    POST    /a",
    "  First",
    "    GET     /a",
  ]);
});

test("an empty document prints a zero count and no groups", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec: { paths: {} } });

  assert.ok(banner.endsWith("Rotte (0)"));
});

test("paths start in the same column whatever the method", () => {
  const spec: OpenApiLike = {
    paths: {
      "/items": { get: { tags: ["T"] }, post: { tags: ["T"] } },
      "/items/{id}": { patch: { tags: ["T"] }, delete: { tags: ["T"] }, put: { tags: ["T"] } },
    },
  };

  const routeLines = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: true, spec })
    .split("\n")
    .filter((line) => line.includes("/items"));

  assert.equal(routeLines.length, 5);
  const columns = routeLines.map((line) => line.indexOf("/items"));
  assert.equal(new Set(columns).size, 1);
});

test("a trailing slash on the base URL does not double up in the addresses", () => {
  const banner = formatStartupBanner({ baseUrl: "http://localhost:4000/", docsEnabled: true, spec: { paths: {} } });

  assert.ok(banner.includes("http://localhost:4000/docs"));
  assert.ok(!banner.includes("//docs"));
  assert.equal(banner.split("\n")[0], "Mateira API in ascolto su http://localhost:4000");
});

test("with the docs disabled the banner is two lines and shows no address or route", () => {
  const banner = formatStartupBanner({ baseUrl: BASE_URL, docsEnabled: false, spec: openApiSpec });

  assert.equal(
    banner,
    "Mateira API in ascolto su http://localhost:4000\nDocumentazione disattivata (DOCS_ENABLED=false)",
  );
  assert.ok(!banner.includes("/docs"));
  assert.ok(!banner.includes("/api/"));
});

function findRouteLine(lines: string[], method: string, path: string): string | undefined {
  const pattern = new RegExp(`^ {4}${method} +${escapeRegExp(path)}( +\\(admin\\))?$`);
  return lines.find((line) => pattern.test(line));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
