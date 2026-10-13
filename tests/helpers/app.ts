import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import { createApp } from "../../src/app";
import { pool, prisma } from "../../src/plugins/prisma";

export type TestResponse = {
  status: number;
  json: any;
  headers: Headers;
  setCookie: string[];
};

export type RequestOptions = {
  body?: unknown;
  token?: string;
  cookie?: string;
  headers?: Record<string, string>;
};

export type Requester = (method: string, path: string, options?: RequestOptions) => Promise<TestResponse>;

export async function startTestServer(): Promise<{ request: Requester; close: () => Promise<void>; port: number }> {
  const server: Server = createApp();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  const request: Requester = async (method, path, options = {}) => {
    const headers: Record<string, string> = { ...(options.headers ?? {}) };
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (options.token) headers["Authorization"] = `Bearer ${options.token}`;
    if (options.cookie) headers["Cookie"] = options.cookie;

    const res = await fetch(base + path, {
      method,
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    return { status: res.status, json: parsed, headers: res.headers, setCookie: res.headers.getSetCookie() };
  };

  const close = async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { request, close, port };
}

export async function resetDb(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("_test")) {
    throw new Error("resetDb refuses to run: DATABASE_URL is not a test database");
  }
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "RefreshToken", "News", "Media", "User" RESTART IDENTITY CASCADE');
}

export async function closeDb(): Promise<void> {
  await prisma.$disconnect();
  await pool.end();
}
