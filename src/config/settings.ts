import { loadEnv } from "./env";
import { parseBoolean, parseDurationEnv, parseIntEnv, parseOrigins } from "../lib/parse";

loadEnv();

export const PORT = parseIntEnv("PORT", process.env.PORT, 4000, 1, 65535);

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 32 || jwtSecret.toLowerCase().startsWith("change-me")) {
  throw new Error(
    "JWT_SECRET must be a random string of at least 32 characters and must not start with \"change-me\". " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
  );
}
export const JWT_SECRET = jwtSecret;
export const JWT_EXPIRES_IN = parseDurationEnv("JWT_EXPIRES_IN", process.env.JWT_EXPIRES_IN, 60 * 60);
export const REFRESH_TOKEN_TTL = parseDurationEnv("REFRESH_TOKEN_TTL", process.env.REFRESH_TOKEN_TTL, 14 * 24 * 60 * 60);
export const BCRYPT_SALT_ROUNDS = parseIntEnv("BCRYPT_SALT_ROUNDS", process.env.BCRYPT_SALT_ROUNDS, 12, 4, 15);

// Secure by default: only an explicit false-like value turns it off (plain-http local development).
const cookieSecure = process.env.COOKIE_SECURE;
export const COOKIE_SECURE = cookieSecure === undefined || cookieSecure.trim() === "" ? true : parseBoolean(cookieSecure);

// The API documentation is a developer tool: on by default, off in production unless DOCS_ENABLED says otherwise.
const docsEnabled = process.env.DOCS_ENABLED;
export const DOCS_ENABLED =
  docsEnabled === undefined || docsEnabled.trim() === ""
    ? process.env.NODE_ENV !== "production"
    : parseBoolean(docsEnabled);

/** How many reverse proxies sit in front of the app and append to X-Forwarded-For. 0 means none: the header is ignored. */
export const TRUST_PROXY_HOPS = parseIntEnv("TRUST_PROXY_HOPS", process.env.TRUST_PROXY_HOPS, 0, 0, 5);

export const LOGIN_RATE_MAX = parseIntEnv("LOGIN_RATE_MAX", process.env.LOGIN_RATE_MAX, 5, 1, 100);
export const LOGIN_RATE_WINDOW = parseDurationEnv("LOGIN_RATE_WINDOW", process.env.LOGIN_RATE_WINDOW, 15 * 60);

export const corsOrigins = parseOrigins(process.env.CORS_ORIGINS, "http://localhost:5173");

export const MEDIA_ENDPOINT = process.env.MEDIA_ENDPOINT || "";
export const MEDIA_REGION = process.env.MEDIA_REGION || "us-east-1";
export const MEDIA_ACCESS_KEY = process.env.MEDIA_ACCESS_KEY || "";
export const MEDIA_SECRET_KEY = process.env.MEDIA_SECRET_KEY || "";
export const MEDIA_BUCKET = process.env.MEDIA_BUCKET || "";
export const MEDIA_PUBLIC_BASE_URL = process.env.MEDIA_PUBLIC_BASE_URL || MEDIA_ENDPOINT || "";
export const MEDIA_FORCE_PATH_STYLE = parseBoolean(process.env.MEDIA_FORCE_PATH_STYLE ?? "true");
export const MEDIA_PRESIGN_EXPIRES_IN = parseDurationEnv(
  "MEDIA_PRESIGN_EXPIRES_IN",
  process.env.MEDIA_PRESIGN_EXPIRES_IN,
  60 * 15,
);
