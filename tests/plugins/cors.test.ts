import { test } from "node:test";
import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

import { applyCors } from "../../src/plugins/cors";

function exchange(origin?: string): { req: IncomingMessage; res: ServerResponse } {
  const req = new IncomingMessage(new Socket());
  if (origin !== undefined) req.headers.origin = origin;
  return { req, res: new ServerResponse(req) };
}

test("applyCors keeps a Vary value that was set earlier", () => {
  const { req, res } = exchange("https://evil.example");
  res.setHeader("Vary", "Accept-Encoding");
  applyCors(req, res);
  assert.deepEqual([res.getHeader("vary")].flat(), ["Accept-Encoding", "Origin"]);
});

test("applyCors adds Vary: Origin once, for a listed origin too", () => {
  const { req, res } = exchange("http://localhost:5173");
  applyCors(req, res);
  assert.equal(res.getHeader("vary"), "Origin");
  assert.equal(res.getHeader("access-control-allow-origin"), "http://localhost:5173");
});

test("applyCors matches origins case-insensitively and echoes the one the browser sent", () => {
  const { req, res } = exchange("HTTP://LOCALHOST:5173");
  applyCors(req, res);
  assert.equal(res.getHeader("access-control-allow-origin"), "HTTP://LOCALHOST:5173");
});
