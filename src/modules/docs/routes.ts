import { IncomingMessage, ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";

import { DOCS_ENABLED } from "../../config/settings";
import { json } from "../../lib/http";
import { openApiSpec } from "./openapi";

const JAVASCRIPT = "application/javascript; charset=utf-8";

/** The only files of swagger-ui-dist that are served. A request is matched against these names exactly. */
const SWAGGER_ASSETS = new Map<string, string>([
  ["swagger-ui.css", "text/css; charset=utf-8"],
  ["swagger-ui-bundle.js", JAVASCRIPT],
  ["swagger-ui-standalone-preset.js", JAVASCRIPT],
  ["favicon-16x16.png", "image/png"],
  ["favicon-32x32.png", "image/png"],
]);

// No inline script: the init code is a file of its own, so a Content-Security-Policy without 'unsafe-inline' keeps working.
const DOCS_PAGE = `<!doctype html>
<html lang="it">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Mateira API, documentazione</title>
    <link rel="icon" type="image/png" sizes="32x32" href="/docs/favicon-32x32.png" />
    <link rel="icon" type="image/png" sizes="16x16" href="/docs/favicon-16x16.png" />
    <link rel="stylesheet" href="/docs/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="/docs/swagger-ui-bundle.js"></script>
    <script src="/docs/swagger-ui-standalone-preset.js"></script>
    <script src="/docs/swagger-init.js"></script>
  </body>
</html>
`;

// Runs in the browser. After a successful login or refresh the access token goes into the Authorize lock by itself,
// so "log in, then try any admin route" needs no copying of tokens. The refresh cookie is sent by the browser.
const SWAGGER_INIT = `const ui = SwaggerUIBundle({
  url: "/openapi.json",
  dom_id: "#swagger-ui",
  presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
  layout: "BaseLayout",
  deepLinking: true,
  displayRequestDuration: true,
  tryItOutEnabled: true,
  persistAuthorization: false,
  responseInterceptor: (res) => {
    try {
      const pathname = new URL(res.url, location.href).pathname;
      if (res.status === 200 && (pathname === "/api/admin/auth/login" || pathname === "/api/admin/auth/refresh")) {
        const accessToken = JSON.parse(res.text).accessToken;
        if (typeof accessToken === "string" && accessToken) ui.preauthorizeApiKey("bearerAuth", accessToken);
      }
    } catch (err) {
      // Not a json answer: leave the response as it is.
    }
    return res;
  },
});
`;

let swaggerDir: string | undefined;

/** The folder of the installed package, found through node's resolution and not through the working directory. */
function swaggerDistDir(): string {
  swaggerDir ??= path.dirname(require.resolve("swagger-ui-dist/package.json"));
  return swaggerDir;
}

function sendText(res: ServerResponse, contentType: string, body: string | Buffer, cacheControl: string): void {
  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Cache-Control", cacheControl);
  res.end(body);
}

/**
 * Serves the Swagger UI page and the OpenAPI document (GET only). Returns false, so the app answers its normal 404,
 * for everything else and for every path when the documentation is disabled.
 */
export async function handleDocs(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  enabled: boolean = DOCS_ENABLED,
): Promise<boolean> {
  if (!enabled || req.method !== "GET") return false;

  if (pathname === "/openapi.json") {
    res.setHeader("Cache-Control", "no-cache");
    json(res, 200, openApiSpec);
    return true;
  }

  if (pathname === "/docs" || pathname === "/docs/") {
    sendText(res, "text/html; charset=utf-8", DOCS_PAGE, "no-cache");
    return true;
  }

  if (!pathname.startsWith("/docs/")) return false;

  // The name is used as it came in the path, never decoded: `..%2f` and friends are simply not in the whitelist.
  const name = pathname.slice("/docs/".length);

  if (name === "swagger-init.js") {
    sendText(res, JAVASCRIPT, SWAGGER_INIT, "no-cache");
    return true;
  }

  const contentType = SWAGGER_ASSETS.get(name);
  if (!contentType) return false;

  let data: Buffer;
  try {
    data = await fs.promises.readFile(path.join(swaggerDistDir(), name));
  } catch (err) {
    console.warn(`Swagger UI asset ${name} could not be read`, err);
    return false;
  }
  sendText(res, contentType, data, "public, max-age=3600");
  return true;
}
