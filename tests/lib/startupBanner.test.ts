import { test } from "node:test";
import assert from "node:assert/strict";

import { formatStartupBanner } from "../../src/lib/startupBanner";

test("with the docs enabled the banner shows the server, Swagger and OpenAPI addresses", () => {
  const banner = formatStartupBanner({ baseUrl: "http://localhost:4000", docsEnabled: true });

  assert.equal(
    banner,
    [
      "Mateira API in ascolto su http://localhost:4000",
      "",
      "Documentazione",
      "  Swagger UI   http://localhost:4000/docs",
      "  OpenAPI      http://localhost:4000/openapi.json",
    ].join("\n"),
  );
});

test("the addresses follow the base URL it is given", () => {
  const banner = formatStartupBanner({ baseUrl: "http://localhost:4010", docsEnabled: true });

  assert.equal(banner.split("\n")[0], "Mateira API in ascolto su http://localhost:4010");
  assert.ok(banner.includes("  Swagger UI   http://localhost:4010/docs"));
  assert.ok(banner.includes("  OpenAPI      http://localhost:4010/openapi.json"));
  assert.ok(!banner.includes(":4000"));
});

test("a trailing slash on the base URL does not double up in the addresses", () => {
  const banner = formatStartupBanner({ baseUrl: "http://localhost:4000/", docsEnabled: true });

  assert.equal(banner.split("\n")[0], "Mateira API in ascolto su http://localhost:4000");
  assert.ok(banner.includes("http://localhost:4000/docs"));
  assert.ok(banner.includes("http://localhost:4000/openapi.json"));
  assert.ok(!banner.includes("//docs") && !banner.includes("//openapi.json"));
});

test("with the docs disabled the banner is exactly two lines and shows no address", () => {
  const banner = formatStartupBanner({ baseUrl: "http://localhost:4000", docsEnabled: false });

  assert.equal(
    banner,
    "Mateira API in ascolto su http://localhost:4000\nDocumentazione disattivata (DOCS_ENABLED=false)",
  );
  assert.ok(!banner.includes("/docs"));
  assert.ok(!banner.includes("openapi.json"));
});

test("the base URL trailing slash is also trimmed when the docs are disabled", () => {
  const banner = formatStartupBanner({ baseUrl: "http://localhost:4000/", docsEnabled: false });

  assert.equal(banner.split("\n")[0], "Mateira API in ascolto su http://localhost:4000");
});

test("the banner is plain ASCII with no carriage returns and no trailing newline", () => {
  for (const docsEnabled of [true, false]) {
    const banner = formatStartupBanner({ baseUrl: "http://localhost:4000", docsEnabled });

    assert.match(banner, /^[\x20-\x7e\n]*$/, `docsEnabled=${docsEnabled}`);
    assert.ok(!banner.includes("\r"));
    assert.ok(!banner.endsWith("\n"));
  }
});
