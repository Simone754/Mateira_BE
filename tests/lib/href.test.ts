import { test } from "node:test";
import assert from "node:assert/strict";

import { parseHref } from "../../src/lib/href";

const is400 = (err: unknown) => (err as { status?: number }).status === 400;
const rejects = (value: unknown, key = "href") =>
  assert.throws(
    () => parseHref(value, key),
    (err: unknown) => {
      assert.ok(is400(err), `${JSON.stringify(value)}: not a 400`);
      assert.ok((err as Error).message.startsWith(key), `the message must name the field: ${(err as Error).message}`);
      return true;
    },
    JSON.stringify(value),
  );

test("parseHref accepts an internal path and keeps it as written", () => {
  assert.equal(parseHref("/", "href"), "/");
  assert.equal(parseHref("/x", "href"), "/x");
  assert.equal(parseHref("/come-lavoriamo", "href"), "/come-lavoriamo");
  assert.equal(parseHref("/news/titolo", "href"), "/news/titolo");
  assert.equal(parseHref("/news?categoria=ricerca#elenco", "href"), "/news?categoria=ricerca#elenco");
  assert.equal(parseHref("/percorso/%C3%A8", "href"), "/percorso/%C3%A8");
});

test("parseHref trims the value before judging it", () => {
  assert.equal(parseHref("  /x  ", "href"), "/x");
  assert.equal(parseHref("\n https://a.b/c \t", "href"), "https://a.b/c");
});

test("parseHref normalises an external address", () => {
  assert.equal(parseHref("https://a.b/c", "href"), "https://a.b/c");
  assert.equal(parseHref("https://a.b", "href"), "https://a.b/");
  assert.equal(parseHref("HTTPS://Example.ORG/Pagina?q=1#x", "href"), "https://example.org/Pagina?q=1#x");
  assert.equal(parseHref("http://example.org:80/a", "href"), "http://example.org/a");
  assert.equal(parseHref("https://example.org/caffè", "href"), "https://example.org/caff%C3%A8");
});

test("parseHref rejects protocol-relative addresses and every scheme but http and https", () => {
  rejects("//x");
  rejects("//evil.example/path");
  rejects("///x");
  rejects("javascript:alert(1)");
  rejects("JavaScript:alert(1)");
  rejects("data:text/html,<script>alert(1)</script>");
  rejects("mailto:a@b.c");
  rejects("tel:+390123456789");
  rejects("ftp://a.b/c");
  rejects("file:///etc/passwd");
  rejects("vbscript:msgbox(1)");
});

test("parseHref rejects what the browser would read as another host or an unsafe address", () => {
  rejects("/\\evil.example"); // a browser treats the backslash as a slash: //evil.example
  rejects("\\\\evil.example");
  rejects("https:evil.example"); // a scheme without the two slashes is not accepted
  rejects("https:/evil.example");
  rejects("https://");
  rejects("https:///path");
  rejects("/x\u0000y");
  rejects("/x\u0007y");
  rejects("/x\u007fy");
});

test("parseHref rejects whitespace inside the value", () => {
  rejects("/a b");
  rejects("/a\tb");
  rejects("/a\nb");
  rejects("/a b");
  rejects("https://a.b/c d");
  rejects("https://a b.c/d");
});

test("parseHref rejects relative and bare values", () => {
  rejects("x");
  rejects("a/b");
  rejects("./x");
  rejects("../x");
  rejects("www.example.org");
  rejects("example.org/pagina");
  rejects("#sezione");
  rejects("?q=1");
});

test("parseHref limits an internal path to 300 characters", () => {
  const ok = `/${"a".repeat(299)}`;
  assert.equal(ok.length, 300);
  assert.equal(parseHref(ok, "href"), ok);
  rejects(`/${"a".repeat(300)}`);
});

test("parseHref limits an external address to 500 characters, before and after normalising", () => {
  const prefix = "https://a.b/";
  const ok = prefix + "a".repeat(500 - prefix.length);
  assert.equal(ok.length, 500);
  assert.equal(parseHref(ok, "href"), ok);
  rejects(`${ok}a`);
  // Short as typed, longer once every character is percent-encoded.
  rejects(`https://a.b/${"è".repeat(200)}`);
});

test("parseHref needs a string, and a non-empty one", () => {
  rejects(undefined);
  rejects(null);
  rejects("");
  rejects("   ");
  rejects(5);
  rejects(true);
  rejects({});
  rejects(["/x"]);
});

test("parseHref names the field it was given", () => {
  assert.throws(() => parseHref("//x", "cta.href"), (err: unknown) => (err as Error).message.startsWith("cta.href "));
  assert.throws(() => parseHref(undefined, "href"), { message: "href is required" });
  assert.throws(() => parseHref(5, "href"), { message: "href must be a string" });
});
