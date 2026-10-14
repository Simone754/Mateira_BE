import { httpError } from "./httpErrors";
import { assertStorableText } from "./validate";

export const INTERNAL_HREF_MAX = 300;
export const EXTERNAL_HREF_MAX = 500;

// Where an internal path is resolved to see what a browser would make of it. The name never resolves (.invalid).
const INTERNAL_BASE = "http://internal.invalid";

// Whitespace of any kind (spaces, tabs, line breaks, no-break space) and control characters.
const UNSAFE_CHARS = /[\s\u0000-\u001f\u007f-\u009f]/;
// After the two slashes the host must start: "https:///x" would be silently read by the URL parser as "https://x/".
const EXTERNAL_RE = /^https?:\/\/[^/]/i;

/**
 * Validates the address of a link and returns it ready to store.
 *
 * Two forms are accepted: an internal path with a single leading slash (`/news/titolo`, at most 300 characters),
 * and an http or https address (at most 500 characters, before and after normalising) without credentials. Both are
 * stored the way the URL parser writes them: a plain path (`/come-lavoriamo`, `/news?x=1#a`) comes back unchanged,
 * while dot segments are resolved and the characters that could break out of an HTML attribute are percent-encoded.
 * Everything else is a 400 whose message starts with `key`: other schemes (`javascript:`, `data:`, `mailto:`),
 * protocol-relative addresses (`//host`, and `/.//host` which resolves to it), backslashes (a browser reads `/\host`
 * as `//host`), spaces, control characters, a NUL or a lone surrogate, and `user:pass@host`.
 * The value is trimmed first. Whether a link is optional is the caller's business: nothing here maps empty to null.
 */
export function parseHref(value: unknown, key: string): string {
  if (value === undefined || value === null) throw httpError(400, `${key} is required`);
  if (typeof value !== "string") throw httpError(400, `${key} must be a string`);

  const href = value.trim();
  if (!href) throw httpError(400, `${key} is required`);
  assertStorableText(href, key);
  if (UNSAFE_CHARS.test(href)) throw httpError(400, `${key} must not contain spaces or control characters`);
  if (href.includes("\\")) throw httpError(400, `${key} must not contain a backslash`);

  if (href.startsWith("/")) {
    if (href.startsWith("//")) throw httpError(400, `${key} must not start with "//"`);
    if (href.length > INTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${INTERNAL_HREF_MAX})`);

    // Resolved the way a browser would, so what is stored is what the browser reads: dot segments are applied
    // ("/.//host" would become "//host"), and the characters that could close an attribute or open a tag are
    // percent-encoded by the parser (the quote, <, >, the backtick, braces; the apostrophe is added below).
    let resolved: URL;
    try {
      resolved = new URL(href, INTERNAL_BASE);
    } catch {
      throw httpError(400, `${key} is not a valid path`);
    }
    if (resolved.origin !== INTERNAL_BASE || resolved.pathname.startsWith("//")) {
      throw httpError(400, `${key} must stay on this site`);
    }
    const path = (resolved.pathname + resolved.search + resolved.hash).replaceAll("'", "%27");
    if (path.length > INTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${INTERNAL_HREF_MAX})`);
    return path;
  }

  if (EXTERNAL_RE.test(href)) {
    if (href.length > EXTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${EXTERNAL_HREF_MAX})`);

    let parsed: URL;
    try {
      parsed = new URL(href);
    } catch {
      throw httpError(400, `${key} is not a valid address`);
    }
    // "https://a.b@evil.example/" reads as a link to a.b and goes to evil.example.
    if (parsed.username || parsed.password) throw httpError(400, `${key} must not contain a username or a password`);
    const normalised = parsed.toString();
    if (normalised.length > EXTERNAL_HREF_MAX) throw httpError(400, `${key} is too long (max ${EXTERNAL_HREF_MAX})`);
    return normalised;
  }

  throw httpError(400, `${key} must be a path starting with a single "/" or an http(s) address`);
}
