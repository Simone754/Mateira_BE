import { test } from "node:test";
import assert from "node:assert/strict";

import { slugify } from "../../src/lib/slug";

test("slugify removes accents and punctuation", () => {
  assert.equal(slugify("Chi siamo"), "chi-siamo");
  assert.equal(slugify("Il Tirreno è un crocevia!"), "il-tirreno-e-un-crocevia");
  assert.equal(slugify("  Più  ricerca / meno   rumore "), "piu-ricerca-meno-rumore");
});

test("slugify falls back when nothing usable remains", () => {
  assert.equal(slugify(" -- !! "), "contenuto");
});

test("slugify truncates long titles without a trailing dash", () => {
  const slug = slugify("parola ".repeat(30));
  assert.ok(slug.length <= 80);
  assert.ok(!slug.endsWith("-"));
});

test("slugify trims the dash left at the truncation point", () => {
  assert.equal(slugify("a".repeat(79) + " bcd"), "a".repeat(79));
});
