import { httpError } from "./httpErrors";

export const INTERNAL_HREF_MAX = 300;
export const EXTERNAL_HREF_MAX = 500;

// Whitespace of any kind (spaces, tabs, line breaks, no-break space) and control characters.
const UNSAFE_CHARS = /[\s\u0000-\u001f\u007f-\u009f]/;
// After the two slashes the host must start: "https:///x" would be silently read by the URL parser as "https://x/".
const EXTERNAL_RE = /^https?:\/\/[^/]/i;

/**
 * Validates the address of a link and returns it ready to store.
 *
 * Two forms are accepted: an internal path with a single leading slash (`/news/titolo`, at most 300 characters),
 * kept as written, and an http or https address (at most 500 characters, before and after normalising), written the
 * way `new URL(...).toString()` writes it. Everything else is a 400 whose message starts with `key`: other schemes
 * (`javascript:`, `data:`, `mailto:`), protocol-relative addresses (`//host`), backslashes (a browser reads `/\host`
 * as `//host`), spaces and control characters.
 * The value is trimmed first. Whether a link is optional is the caller's business: nothing here maps empty to null.
 */
export function parseHref(value: unknown, key: string): string {
  if (value === undefined || value === null) throw httpError(400, `${key} is required`);
  if (typeof value !== "string") throw httpError(400, `${key} must be a string`);

  const href = value.trim();
  if (!href) throw httpError(400, `${key} is required`);
  if (UNSAFE_CHARS.test(href)) throw httpError(400, `${key} must not contain spaces or control characters`);
  if (href.includes("\\")) throw httpError(400, `${key} must not contain a backslash`);

  if (href.startsWith("/")) {
    if (href.startsWith("//")) throw httpError(400, `${key} must not start with "//"`);
    if (href.length > INTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${INTERNAL_HREF_MAX})`);
    return href;
  }

  if (EXTERNAL_RE.test(href)) {
    if (href.length > EXTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${EXTERNAL_HREF_MAX})`);

    let normalised: string;
    try {
      normalised = new URL(href).toString();
    } catch {
      throw httpError(400, `${key} is not a valid address`);
    }
    if (normalised.length > EXTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${EXTERNAL_HREF_MAX})`);
    return normalised;
  }

  throw httpError(400, `${key} must be a path starting with a single "/" or an http(s) address`);
}
