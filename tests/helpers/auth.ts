import { ensureSuperuser } from "../../src/modules/auth/service";
import type { Requester } from "./app";

export const ADMIN_EMAIL = "admin@test.local";
export const ADMIN_PASSWORD = "correct-horse-battery";

export function refreshPair(setCookie: string[]): string {
  const cookie = setCookie.find((c) => c.startsWith("mateira_refresh="));
  if (!cookie) throw new Error("refresh cookie not set");
  return cookie.split(";")[0];
}

export async function loginAsAdmin(request: Requester): Promise<{ token: string; cookie: string }> {
  await ensureSuperuser(ADMIN_EMAIL, ADMIN_PASSWORD);
  const res = await request("POST", "/api/admin/auth/login", {
    body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
  });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.json)}`);
  return { token: res.json.accessToken, cookie: refreshPair(res.setCookie) };
}
