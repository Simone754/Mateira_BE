import { httpError } from "./httpErrors";

type Obj = Record<string, unknown>;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export function asObject(value: unknown): Obj {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "request body must be a JSON object");
  }
  return value as Obj;
}

export function reqString(o: Obj, key: string, max = 200): string {
  const value = o[key];
  if (typeof value !== "string" || !value.trim()) throw httpError(400, `${key} is required`);
  const trimmed = value.trim();
  if (trimmed.length > max) throw httpError(400, `${key} is too long (max ${max})`);
  return trimmed;
}

/** undefined = field not sent; null = explicitly cleared. */
export function optString(o: Obj, key: string, max = 200): string | null | undefined {
  if (!(key in o)) return undefined;
  const value = o[key];
  if (value === null) return null;
  if (typeof value !== "string") throw httpError(400, `${key} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw httpError(400, `${key} is too long (max ${max})`);
  return trimmed;
}

export function reqEnum<T extends string>(o: Obj, key: string, values: readonly T[]): T {
  const value = o[key];
  if (typeof value !== "string" || !(values as readonly string[]).includes(value)) {
    throw httpError(400, `${key} must be one of: ${values.join(", ")}`);
  }
  return value as T;
}

export function optEnum<T extends string>(o: Obj, key: string, values: readonly T[]): T | undefined {
  if (!(key in o)) return undefined;
  return reqEnum(o, key, values);
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export function reqDate(o: Obj, key: string): Date {
  const value = o[key];
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) {
    throw httpError(400, `${key} must be an ISO date`);
  }
  const date = typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) throw httpError(400, `${key} must be an ISO date`);
  return date;
}

export function optDate(o: Obj, key: string): Date | undefined {
  if (!(key in o)) return undefined;
  return reqDate(o, key);
}

export function optUuid(o: Obj, key: string): string | null | undefined {
  if (!(key in o)) return undefined;
  const value = o[key];
  if (value === null) return null;
  if (!isUuid(value)) throw httpError(400, `${key} must be a uuid`);
  return value;
}

export function optUuidList(o: Obj, key: string, max = 10): string[] | undefined {
  if (!(key in o)) return undefined;
  const value = o[key];
  if (!Array.isArray(value) || value.length > max || !value.every(isUuid)) {
    throw httpError(400, `${key} must be a list of at most ${max} uuids`);
  }
  return [...new Set(value)];
}
