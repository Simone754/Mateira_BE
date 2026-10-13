import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

// settings.ts reads the environment once, at import time, so every case loads it in a fresh process.
// The working directory is an empty folder: no .env file can fill in variables the case leaves out.
const root = path.resolve(__dirname, "../..");
const tsxLoader = pathToFileURL(path.join(root, "node_modules/tsx/dist/loader.mjs")).href;
const settingsModule = path.join(root, "src/config/settings.ts");
const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "mateira-settings-"));

const SECRET = "x".repeat(40);
const script = `
  const s = require(${JSON.stringify(settingsModule)});
  console.log(JSON.stringify({ ...s, corsOrigins: [...s.corsOrigins], JWT_SECRET: undefined }));
`;

type Loaded = { ok: true; settings: Record<string, any> } | { ok: false; error: string };

function loadSettings(env: Record<string, string | undefined>): Promise<Loaded> {
  const childEnv: Record<string, string> = {};
  for (const name of ["PATH", "Path", "SystemRoot", "TEMP", "TMP"]) {
    if (process.env[name] !== undefined) childEnv[name] = process.env[name]!;
  }
  for (const [name, value] of Object.entries({ JWT_SECRET: SECRET, ...env })) {
    if (value !== undefined) childEnv[name] = value;
  }

  return new Promise((resolve) => {
    execFile(
      process.execPath,
      ["--import", tsxLoader, "-e", script],
      { cwd: emptyDir, env: childEnv },
      (err, stdout, stderr) => {
        if (err) resolve({ ok: false, error: stderr });
        else resolve({ ok: true, settings: JSON.parse(stdout) });
      },
    );
  });
}

async function assertRejected(env: Record<string, string | undefined>, message: string | RegExp): Promise<void> {
  const loaded = await loadSettings(env);
  assert.equal(loaded.ok, false, `expected ${JSON.stringify(env)} to be rejected`);
  if (!loaded.ok) {
    if (typeof message === "string") assert.ok(loaded.error.includes(message), loaded.error);
    else assert.match(loaded.error, message);
  }
}

async function assertAccepted(env: Record<string, string | undefined>): Promise<Record<string, any>> {
  const loaded = await loadSettings(env);
  assert.equal(loaded.ok, true, loaded.ok ? "" : loaded.error);
  return loaded.ok ? loaded.settings : {};
}

test("defaults apply when only JWT_SECRET is set, and cookies are Secure", async () => {
  const s = await assertAccepted({});
  assert.equal(s.PORT, 4000);
  assert.equal(s.BCRYPT_SALT_ROUNDS, 12);
  assert.equal(s.LOGIN_RATE_MAX, 5);
  assert.equal(s.TRUST_PROXY_HOPS, 0);
  assert.equal(s.JWT_EXPIRES_IN, 3600);
  assert.equal(s.REFRESH_TOKEN_TTL, 14 * 86400);
  assert.equal(s.LOGIN_RATE_WINDOW, 900);
  assert.equal(s.MEDIA_PRESIGN_EXPIRES_IN, 900);
  assert.equal(s.COOKIE_SECURE, true);
  assert.deepEqual(s.corsOrigins, ["http://localhost:5173"]);
});

test("empty values behave like unset ones", async () => {
  const s = await assertAccepted({
    PORT: "",
    BCRYPT_SALT_ROUNDS: "",
    LOGIN_RATE_MAX: "",
    TRUST_PROXY_HOPS: "",
    JWT_EXPIRES_IN: "",
    REFRESH_TOKEN_TTL: "",
    LOGIN_RATE_WINDOW: "",
    MEDIA_PRESIGN_EXPIRES_IN: "",
    COOKIE_SECURE: "",
    CORS_ORIGINS: "",
  });
  assert.equal(s.PORT, 4000);
  assert.equal(s.LOGIN_RATE_MAX, 5);
  assert.equal(s.TRUST_PROXY_HOPS, 0);
  assert.equal(s.COOKIE_SECURE, true);
  assert.deepEqual(s.corsOrigins, ["http://localhost:5173"]);
});

test("valid values are read", async () => {
  const s = await assertAccepted({
    PORT: "8080",
    BCRYPT_SALT_ROUNDS: "10",
    LOGIN_RATE_MAX: "7",
    TRUST_PROXY_HOPS: "2",
    JWT_EXPIRES_IN: "30m",
    REFRESH_TOKEN_TTL: "7d",
    LOGIN_RATE_WINDOW: "600",
    MEDIA_PRESIGN_EXPIRES_IN: "5m",
    COOKIE_SECURE: "false",
    CORS_ORIGINS: "https://App.example.com/, https://admin.example.com",
  });
  assert.equal(s.PORT, 8080);
  assert.equal(s.BCRYPT_SALT_ROUNDS, 10);
  assert.equal(s.LOGIN_RATE_MAX, 7);
  assert.equal(s.TRUST_PROXY_HOPS, 2);
  assert.equal(s.JWT_EXPIRES_IN, 1800);
  assert.equal(s.REFRESH_TOKEN_TTL, 7 * 86400);
  assert.equal(s.LOGIN_RATE_WINDOW, 600);
  assert.equal(s.MEDIA_PRESIGN_EXPIRES_IN, 300);
  assert.equal(s.COOKIE_SECURE, false);
  assert.deepEqual(s.corsOrigins, ["https://app.example.com", "https://admin.example.com"]);
});

test("JWT_SECRET is required, at least 32 characters and not a placeholder", async () => {
  await Promise.all([
    assertRejected({ JWT_SECRET: undefined }, "JWT_SECRET"),
    assertRejected({ JWT_SECRET: "" }, "JWT_SECRET"),
    assertRejected({ JWT_SECRET: "short" }, "JWT_SECRET"),
    assertRejected({ JWT_SECRET: "y".repeat(31) }, "JWT_SECRET"),
    assertRejected({ JWT_SECRET: `change-me-${"z".repeat(40)}` }, "JWT_SECRET"),
    assertRejected({ JWT_SECRET: `CHANGE-ME-${"z".repeat(40)}` }, "JWT_SECRET"),
    assertAccepted({ JWT_SECRET: "y".repeat(32) }),
  ]);
});

test("a bad JWT_SECRET never ends up in the error message", async () => {
  const loaded = await loadSettings({ JWT_SECRET: "super-secret-short" });
  assert.equal(loaded.ok, false);
  if (!loaded.ok) {
    assert.ok(loaded.error.includes("JWT_SECRET must"), loaded.error);
    assert.ok(!loaded.error.includes("super-secret-short"));
  }
});

test("integer settings outside their range or not numeric stop the start", async () => {
  const range = (name: string, min: number, max: number) => `${name} must be an integer between ${min} and ${max}`;
  await Promise.all([
    assertRejected({ LOGIN_RATE_MAX: "abc" }, range("LOGIN_RATE_MAX", 1, 100)),
    assertRejected({ LOGIN_RATE_MAX: "0" }, range("LOGIN_RATE_MAX", 1, 100)),
    assertRejected({ LOGIN_RATE_MAX: "101" }, range("LOGIN_RATE_MAX", 1, 100)),
    assertRejected({ PORT: "0" }, range("PORT", 1, 65535)),
    assertRejected({ PORT: "65536" }, range("PORT", 1, 65535)),
    assertRejected({ PORT: "80a" }, range("PORT", 1, 65535)),
    assertRejected({ BCRYPT_SALT_ROUNDS: "3" }, range("BCRYPT_SALT_ROUNDS", 4, 15)),
    assertRejected({ BCRYPT_SALT_ROUNDS: "16" }, range("BCRYPT_SALT_ROUNDS", 4, 15)),
    assertRejected({ TRUST_PROXY_HOPS: "-1" }, range("TRUST_PROXY_HOPS", 0, 5)),
    assertRejected({ TRUST_PROXY_HOPS: "6" }, range("TRUST_PROXY_HOPS", 0, 5)),
    assertRejected({ TRUST_PROXY_HOPS: "true" }, range("TRUST_PROXY_HOPS", 0, 5)),
  ]);
});

test("duration settings that are invalid or zero stop the start", async () => {
  const duration = (name: string) => `${name} must be a duration like 90, 15m, 1h or 14d (greater than zero)`;
  const names = ["JWT_EXPIRES_IN", "REFRESH_TOKEN_TTL", "LOGIN_RATE_WINDOW", "MEDIA_PRESIGN_EXPIRES_IN"];
  await Promise.all(
    names.flatMap((name) => ["abc", "0", "0m"].map((value) => assertRejected({ [name]: value }, duration(name)))),
  );
});

test("COOKIE_SECURE is on unless it is explicitly turned off", async () => {
  const cases: [string | undefined, boolean][] = [
    [undefined, true],
    ["", true],
    ["true", true],
    ["1", true],
    ["false", false],
    ["FALSE", false],
    ["0", false],
  ];
  const results = await Promise.all(cases.map(([value]) => assertAccepted({ COOKIE_SECURE: value })));
  results.forEach((settings, i) => assert.equal(settings.COOKIE_SECURE, cases[i][1], `COOKIE_SECURE=${cases[i][0]}`));
});
