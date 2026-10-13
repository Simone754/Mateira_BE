import { test } from "node:test";
import assert from "node:assert/strict";

import {
  asObject,
  isUuid,
  optDate,
  optEnum,
  optString,
  optUuid,
  optUuidList,
  reqDate,
  reqEnum,
  reqString,
} from "../../src/lib/validate";

const is400 = (err: unknown) => (err as { status?: number }).status === 400;
const UUID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";

test("asObject rejects null, arrays and scalars", () => {
  assert.throws(() => asObject(null), is400);
  assert.throws(() => asObject([]), is400);
  assert.throws(() => asObject("x"), is400);
  assert.deepEqual(asObject({ a: 1 }), { a: 1 });
});

test("reqString trims, requires and limits length", () => {
  assert.equal(reqString({ t: "  ciao " }, "t"), "ciao");
  assert.throws(() => reqString({}, "t"), is400);
  assert.throws(() => reqString({ t: "   " }, "t"), is400);
  assert.throws(() => reqString({ t: "x".repeat(11) }, "t", 10), is400);
});

test("optString distinguishes absent, cleared and set", () => {
  assert.equal(optString({}, "a"), undefined);
  assert.equal(optString({ a: null }, "a"), null);
  assert.equal(optString({ a: "  " }, "a"), null);
  assert.equal(optString({ a: " x " }, "a"), "x");
  assert.throws(() => optString({ a: 5 }, "a"), is400);
});

test("reqEnum and optEnum only accept listed values", () => {
  const values = ["A", "B"] as const;
  assert.equal(reqEnum({ k: "A" }, "k", values), "A");
  assert.throws(() => reqEnum({ k: "C" }, "k", values), is400);
  assert.equal(optEnum({}, "k", values), undefined);
  assert.equal(optEnum({ k: "B" }, "k", values), "B");
});

test("reqDate and optDate parse ISO strings", () => {
  assert.equal(reqDate({ d: "2026-10-07T10:00:00Z" }, "d").toISOString(), "2026-10-07T10:00:00.000Z");
  assert.throws(() => reqDate({ d: "nope" }, "d"), is400);
  assert.throws(() => reqDate({}, "d"), is400);
  assert.equal(optDate({}, "d"), undefined);
});

test("uuid helpers", () => {
  assert.equal(isUuid(UUID), true);
  assert.equal(isUuid("123"), false);
  assert.equal(optUuid({}, "i"), undefined);
  assert.equal(optUuid({ i: null }, "i"), null);
  assert.equal(optUuid({ i: UUID }, "i"), UUID);
  assert.throws(() => optUuid({ i: "x" }, "i"), is400);
  assert.deepEqual(optUuidList({ l: [UUID, UUID] }, "l"), [UUID]);
  assert.throws(() => optUuidList({ l: ["x"] }, "l"), is400);
  assert.throws(() => optUuidList({ l: [UUID, UUID] }, "l", 0), is400);
});
