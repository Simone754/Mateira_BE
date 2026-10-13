import { IncomingMessage, ServerResponse } from "node:http";

import { corsOrigins } from "../config/settings";

export function applyCors(req: IncomingMessage, res: ServerResponse): void {
  const header = req.headers.origin;
  const origin = Array.isArray(header) ? header[0] : header || "";

  if (origin && corsOrigins.has(origin.toLowerCase())) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }

  // The answer depends on the Origin request header whether or not it is allowed: a cache must not serve one
  // origin's answer to another. appendHeader keeps any Vary value set earlier.
  res.appendHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
  res.setHeader("Access-Control-Expose-Headers", "Retry-After");
  res.setHeader("Access-Control-Max-Age", "86400");
}
