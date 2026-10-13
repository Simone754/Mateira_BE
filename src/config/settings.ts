import { loadEnv } from "./env";
import { parseBoolean, parseDuration, parseList } from "../lib/parse";

loadEnv();

export const PORT = Number(process.env.PORT || 4000);

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || jwtSecret.length < 16) {
  throw new Error("JWT_SECRET is required and must be at least 16 characters");
}
export const JWT_SECRET = jwtSecret;
export const JWT_EXPIRES_IN = parseDuration(process.env.JWT_EXPIRES_IN, 60 * 60);
export const REFRESH_TOKEN_TTL = parseDuration(process.env.REFRESH_TOKEN_TTL, 14 * 24 * 60 * 60);
export const BCRYPT_SALT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 12);

export const COOKIE_SECURE = parseBoolean(process.env.COOKIE_SECURE);
export const TRUST_PROXY = parseBoolean(process.env.TRUST_PROXY);

export const LOGIN_RATE_MAX = Number(process.env.LOGIN_RATE_MAX || 5);
export const LOGIN_RATE_WINDOW = parseDuration(process.env.LOGIN_RATE_WINDOW, 15 * 60);

export const corsOrigins = parseList(process.env.CORS_ORIGINS || "http://localhost:5173", true);

export const MEDIA_ENDPOINT = process.env.MEDIA_ENDPOINT || "";
export const MEDIA_REGION = process.env.MEDIA_REGION || "us-east-1";
export const MEDIA_ACCESS_KEY = process.env.MEDIA_ACCESS_KEY || "";
export const MEDIA_SECRET_KEY = process.env.MEDIA_SECRET_KEY || "";
export const MEDIA_BUCKET = process.env.MEDIA_BUCKET || "";
export const MEDIA_PUBLIC_BASE_URL = process.env.MEDIA_PUBLIC_BASE_URL || MEDIA_ENDPOINT || "";
export const MEDIA_FORCE_PATH_STYLE = parseBoolean(process.env.MEDIA_FORCE_PATH_STYLE ?? "true");
export const MEDIA_PRESIGN_EXPIRES_IN = parseDuration(process.env.MEDIA_PRESIGN_EXPIRES_IN, 60 * 15);
