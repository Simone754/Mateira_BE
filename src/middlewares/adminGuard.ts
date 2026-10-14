import { ServerResponse } from "node:http";

import { unauthorized } from "../lib/http";
import type { AdminSession } from "./requireAdmin";

// The routers import the session type from here, so that none of them has to name the token check.
export type { AdminSession } from "./requireAdmin";

/** The admin routes that are open on purpose: they are how a session starts, renews and ends. */
export const OPEN_ADMIN_ROUTES: ReadonlySet<string> = new Set([
  "POST /api/admin/auth/login",
  "POST /api/admin/auth/refresh",
  "POST /api/admin/auth/logout",
]);

/**
 * True when the request goes to the admin area and is not one of the open routes.
 *
 * It reads the same `parts` the routers match on (the path split on "/" with the empty segments dropped), so every
 * path a router would serve as an admin route, "/api//admin/news" included, is guarded.
 */
export function isGuardedAdminRequest(method: string | undefined, parts: readonly string[]): boolean {
  if (parts[0] !== "api" || parts[1] !== "admin") return false;
  return !OPEN_ADMIN_ROUTES.has(`${method ?? ""} /${parts.join("/")}`);
}

/**
 * For the admin routers: true when the app guard verified a session. Otherwise it answers 401 and returns false, so a
 * router reached without going through the guard (a routing mistake) still refuses the request.
 */
export function hasSession(res: ServerResponse, session: AdminSession | null): session is AdminSession {
  if (session) return true;
  unauthorized(res);
  return false;
}
