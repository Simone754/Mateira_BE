import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { WORD_PAGES } from "../src/modules/words/dto";
import { prisma } from "../src/plugins/prisma";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";
import { loginAsAdmin } from "./helpers/auth";

let request: Requester;
let close: () => Promise<void>;
let token: string;

before(async () => {
  ({ request, close } = await startTestServer());
});

after(async () => {
  await close();
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  ({ token } = await loginAsAdmin(request));
});

const WORDS = "/api/admin/words";
const PUBLIC = "/api/public/words";
const UNKNOWN_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";
const DUPLICATE = { error: "a word with this term already exists on this page" };

const wordBody = (overrides: Record<string, unknown> = {}) => ({
  term: "Fondazione",
  etymology: "Dal latino FUNDUS.",
  meaning: "Fondare significa partire da basi solide.",
  page: "mateira",
  ...overrides,
});

const post = (body: unknown) => request("POST", WORDS, { token, body });
const patch = (id: string, body: unknown) => request("PATCH", `${WORDS}/${id}`, { token, body });
const getOne = (id: string) => request("GET", `${WORDS}/${id}`, { token });

async function createWord(overrides: Record<string, unknown> = {}) {
  const res = await post(wordBody(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function adminWords(query = ""): Promise<any[]> {
  const res = await request("GET", `${WORDS}${query}`, { token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.words;
}

async function publicWords(query = ""): Promise<any[]> {
  const res = await request("GET", `${PUBLIC}${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.words;
}

const terms = (words: any[]) => words.map((w) => w.term);

// ---------------------------------------------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------------------------------------------

test("every admin route needs the admin token and changes nothing without it", async () => {
  const created = await createWord();
  const byId = `${WORDS}/${created.id}`;
  const routes: [string, string, unknown?][] = [
    ["GET", WORDS],
    ["POST", WORDS, wordBody({ term: "Intrusa" })],
    ["GET", byId],
    ["PATCH", byId, { term: "Manomessa" }],
    ["DELETE", byId],
    ["GET", `${WORDS}/not-a-uuid`],
  ];
  for (const [method, path, body] of routes) {
    const res = await request(method, path, { body });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(res.json, { error: "Unauthorized" });
  }
  assert.deepEqual(await adminWords(), [created], "nothing was created, changed or deleted");
});

test("the public route is read-only and has no sub-paths", async () => {
  const created = await createWord({ status: "PUBLISHED" });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await request(method, PUBLIC, { token, body: wordBody({ term: "Intrusa" }) });
    assert.equal(res.status, 404, method);
  }
  assert.equal((await request("GET", `${PUBLIC}/${created.id}`)).status, 404);
  assert.deepEqual(terms(await publicWords()), ["Fondazione"]);
});

test("admin answers are not cached", async () => {
  const res = await request("GET", WORDS, { token });
  assert.equal(res.headers.get("cache-control"), "no-store");
});

// ---------------------------------------------------------------------------------------------------------------
// Creating
// ---------------------------------------------------------------------------------------------------------------

test("a word is created as a draft at the end of its page, without a closing sentence", async () => {
  const res = await post(wordBody());
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const word = res.json;
  assert.match(word.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.deepEqual(Object.keys(word).sort(), [
    "closing",
    "createdAt",
    "etymology",
    "id",
    "meaning",
    "page",
    "position",
    "publishedAt",
    "status",
    "term",
    "updatedAt",
  ]);
  assert.deepEqual(
    [word.term, word.etymology, word.meaning, word.closing, word.page, word.position, word.status, word.publishedAt],
    ["Fondazione", "Dal latino FUNDUS.", "Fondare significa partire da basi solide.", null, "mateira", 0, "DRAFT", null],
  );
  assert.ok(!Number.isNaN(Date.parse(word.createdAt)));
  assert.ok(!Number.isNaN(Date.parse(word.updatedAt)));
});

test("a word created as PUBLISHED has its publication date and is public at once", async () => {
  const started = Date.now();
  const word = await createWord({ closing: "Porre solide basi.", status: "PUBLISHED" });
  assert.equal(word.closing, "Porre solide basi.");
  assert.ok(Date.parse(word.publishedAt) >= started - 1000);
  assert.deepEqual(terms(await publicWords()), ["Fondazione"]);
});

test("every page of the list is accepted", async () => {
  assert.deepEqual(
    [...WORD_PAGES],
    [
      "home",
      "mateira",
      "come-lavoriamo",
      "tirreno",
      "programmi",
      "impatto",
      "tirenauti",
      "viaggio-dei-tirenauti",
      "partecipare",
      "collabora-con-mateira",
    ],
  );
  for (const page of WORD_PAGES) assert.equal((await post(wordBody({ page }))).status, 201, page);
  assert.equal((await adminWords()).length, WORD_PAGES.length);
});

test("the limits of every field are inclusive", async () => {
  const cases: [string, number][] = [
    ["term", 60],
    ["etymology", 1000],
    ["meaning", 3000],
    ["closing", 300],
  ];
  for (const [field, max] of cases) {
    const ok = await post(wordBody({ term: `Entro ${field}`, [field]: "a".repeat(max) }));
    assert.equal(ok.status, 201, `${field} at ${max}: ${JSON.stringify(ok.json)}`);
    const over = await post(wordBody({ term: `Oltre ${field}`, [field]: "b".repeat(max + 1) }));
    assert.equal(over.status, 400, `${field} at ${max + 1}`);
    assert.deepEqual(over.json, { error: `${field} is too long (max ${max})` });
  }
  for (const position of [0, 9999]) {
    const res = await post(wordBody({ term: `Posizione ${position}`, position }));
    assert.equal(res.status, 201, JSON.stringify(res.json));
    assert.equal(res.json.position, position);
  }
  for (const position of [-1, 10000, 1.5, "1", null, true]) {
    const res = await post(wordBody({ term: "Fuori scala", position }));
    assert.equal(res.status, 400, `position ${JSON.stringify(position)}`);
    assert.deepEqual(res.json, { error: "position must be an integer from 0 to 9999" });
  }
});

test("term, etymology, meaning and page are required, and a blank value counts as missing", async () => {
  for (const field of ["term", "etymology", "meaning"]) {
    const without: Record<string, unknown> = wordBody();
    delete without[field];
    for (const body of [without, { ...without, [field]: "   " }, { ...without, [field]: null }, { ...without, [field]: 42 }]) {
      const res = await post(body);
      assert.equal(res.status, 400, `${field}: ${JSON.stringify(body)}`);
      assert.deepEqual(res.json, { error: `${field} is required` });
    }
  }
  const noPage: Record<string, unknown> = wordBody();
  delete noPage.page;
  for (const body of [noPage, ...["", "HOME", "news", "constructor", 1].map((page) => ({ ...noPage, page }))]) {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, /^page must be one of: home, mateira, come-lavoriamo, /);
  }
  assert.deepEqual(await adminWords(), [], "nothing was stored");
});

test("texts are trimmed, line ends become \\n, and an empty or null closing is stored as null", async () => {
  const word = await createWord({
    term: "  Generare  ",
    etymology: "  Dal latino GENERARE.\r\n“dare origine”  ",
    meaning: "Primo paragrafo.\r\n\r\nSecondo,\rcon un a capo.",
    closing: "   ",
  });
  assert.equal(word.term, "Generare");
  assert.equal(word.etymology, "Dal latino GENERARE.\n“dare origine”");
  assert.equal(word.meaning, "Primo paragrafo.\n\nSecondo,\ncon un a capo.");
  assert.equal(word.closing, null);
  assert.equal((await createWord({ term: "Viaggio", closing: null })).closing, null);
  assert.equal((await createWord({ term: "Disegnare", closing: " Tracciare insieme.\r\n" })).closing, "Tracciare insieme.");
});

test("lengths are measured after the line ends become \\n", async () => {
  // 3001 characters as sent, 2001 once every "\r\n" is a "\n": within the limit.
  const word = await createWord({ meaning: "a\r\n".repeat(1000) + "a" });
  assert.equal(word.meaning.length, 2001);
});

test("the term is a single line", async () => {
  for (const term of ["Due\nrighe", "Due\r\nrighe", "Due\rrighe"]) {
    const res = await post(wordBody({ term }));
    assert.equal(res.status, 400, JSON.stringify(term));
    assert.deepEqual(res.json, { error: "term must be a single line" });
  }
});

test("unknown keys are refused on create and on patch, prototype names included", async () => {
  const word = await createWord();
  const extras: Record<string, unknown>[] = [
    { id: UNKNOWN_ID },
    { publishedAt: "2026-01-01" },
    { createdAt: "2026-01-01" },
    { slug: "fondazione" },
    { constructor: "x" },
    { toString: "x" },
  ];
  for (const extra of extras) {
    const key = Object.keys(extra)[0];
    const created = await post({ ...wordBody({ term: "Nuova" }), ...extra });
    assert.equal(created.status, 400, key);
    assert.deepEqual(created.json, { error: `${key} is not allowed` });
    const patched = await patch(word.id, { meaning: "Cambiato.", ...extra });
    assert.equal(patched.status, 400, key);
    assert.deepEqual(patched.json, { error: `${key} is not allowed` });
  }
  // JSON.parse makes "__proto__" an own key: it is refused like any other unknown key.
  const proto = await post(JSON.parse('{"__proto__": {"status": "PUBLISHED"}, "term": "X", "etymology": "E", "meaning": "M", "page": "home"}'));
  assert.equal(proto.status, 400);
  assert.deepEqual(proto.json, { error: "__proto__ is not allowed" });
  assert.deepEqual(await adminWords(), [word], "nothing was stored or changed");
});

test("a NUL or a lone surrogate in any text is a 400 on create and on patch, never a 500", async () => {
  const word = await createWord();
  for (const field of ["term", "etymology", "meaning", "closing"]) {
    for (const bad of ["a\u0000b", "a\ud800b"]) {
      const created = await post(wordBody({ term: "Nuova", [field]: bad }));
      assert.equal(created.status, 400, `${field} on create`);
      assert.deepEqual(created.json, { error: `${field} contains characters that cannot be stored` });
      const patched = await patch(word.id, { [field]: bad });
      assert.equal(patched.status, 400, `${field} on patch`);
      assert.deepEqual(patched.json, { error: `${field} contains characters that cannot be stored` });
    }
  }
});

test("the request body itself is validated", async () => {
  const word = await createWord();
  for (const body of [[], "testo", 42, null]) {
    const created = await post(body);
    assert.deepEqual([created.status, created.json], [400, { error: "request body must be a JSON object" }], JSON.stringify(body));
    assert.equal((await patch(word.id, body)).status, 400, JSON.stringify(body));
  }
  const empty = await request("POST", WORDS, { token });
  assert.deepEqual([empty.status, empty.json], [400, { error: "request body must be a JSON object" }]);
});

// ---------------------------------------------------------------------------------------------------------------
// Reading: drafts, filters and order
// ---------------------------------------------------------------------------------------------------------------

test("an empty list is an empty array", async () => {
  assert.deepEqual(await publicWords(), []);
  assert.deepEqual(await adminWords(), []);
});

test("drafts never reach the public API, and the public answer carries only the reader's fields", async () => {
  await createWord({ term: "Bozza" });
  const published = await createWord({ term: "Pubblicata", closing: "Chiusa.", status: "PUBLISHED" });
  const expected = [
    {
      id: published.id,
      term: "Pubblicata",
      etymology: published.etymology,
      meaning: published.meaning,
      closing: "Chiusa.",
      page: "mateira",
    },
  ];
  assert.deepEqual(await publicWords(), expected);
  assert.deepEqual(await publicWords("?page=mateira"), expected);
});

test("publishing shows a word, unpublishing hides it, and the first publication date survives", async () => {
  const word = await createWord();
  const first = await patch(word.id, { status: "PUBLISHED" });
  assert.equal(first.status, 200, JSON.stringify(first.json));
  assert.ok(first.json.publishedAt);
  assert.deepEqual(terms(await publicWords()), ["Fondazione"]);

  const hidden = await patch(word.id, { status: "DRAFT" });
  assert.equal(hidden.json.publishedAt, first.json.publishedAt);
  assert.deepEqual(await publicWords(), []);

  const again = await patch(word.id, { status: "PUBLISHED" });
  assert.equal(again.json.publishedAt, first.json.publishedAt);
});

test("the lists follow the order of the pages and then the position, and the filter keeps one page", async () => {
  // Created out of order on purpose.
  await createWord({ term: "Viaggio", page: "viaggio-dei-tirenauti", status: "PUBLISHED" });
  await createWord({ term: "Seconda", page: "home", position: 5, status: "PUBLISHED" });
  await createWord({ term: "Fondazione", page: "mateira", status: "PUBLISHED" });
  await createWord({ term: "Prima", page: "home", position: 1, status: "PUBLISHED" });
  const third = await createWord({ term: "Terza", page: "home" });
  assert.equal(third.position, 6, "last on its page");

  assert.deepEqual(terms(await publicWords()), ["Prima", "Seconda", "Fondazione", "Viaggio"]);
  assert.deepEqual(terms(await publicWords("?page=home")), ["Prima", "Seconda"]);
  assert.deepEqual(await publicWords("?page=tirreno"), []);
  assert.deepEqual(terms(await adminWords()), ["Prima", "Seconda", "Terza", "Fondazione", "Viaggio"]);
  assert.deepEqual(terms(await adminWords("?page=home")), ["Prima", "Seconda", "Terza"]);
  // A repeated filter counts once: the last one, as for the news filters.
  assert.deepEqual(terms(await publicWords("?page=home&page=mateira")), ["Fondazione"]);
  assert.deepEqual(terms(await adminWords("?page=home&page=mateira")), ["Fondazione"]);
});

test("a page outside the list, or an empty one, is a 400 on both lists", async () => {
  for (const query of ["?page=", "?page=news", "?page=HOME", "?page=constructor"]) {
    const pub = await request("GET", `${PUBLIC}${query}`);
    assert.equal(pub.status, 400, query);
    assert.match(pub.json.error, /^page must be one of: /);
    assert.equal((await request("GET", `${WORDS}${query}`, { token })).status, 400, query);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Positions
// ---------------------------------------------------------------------------------------------------------------

test("each page has its own order: a new word goes last on its page", async () => {
  assert.equal((await createWord({ term: "A", page: "home" })).position, 0);
  assert.equal((await createWord({ term: "B", page: "home" })).position, 1);
  assert.equal((await createWord({ term: "C", page: "impatto" })).position, 0);
  await prisma.word.deleteMany({ where: { term: "B" } });
  assert.equal((await createWord({ term: "D", page: "home" })).position, 1);
});

test("words with the same position are read by creation date and then by id", async () => {
  const first = await createWord({ term: "Uno", page: "home", position: 3 });
  const second = await createWord({ term: "Due", page: "home", position: 3 });
  assert.deepEqual(terms(await adminWords()), ["Uno", "Due"]);

  // The same creation date too: the id decides.
  await prisma.word.updateMany({
    where: { id: { in: [first.id, second.id] } },
    data: { createdAt: new Date("2026-10-01T09:00:00Z") },
  });
  const byId = [first, second].sort((a, b) => (a.id < b.id ? -1 : 1)).map((w) => w.term);
  assert.deepEqual(terms(await adminWords()), byId);
});

test("a page already at position 9999 gives 9999, never more, to a new or a moved word", async () => {
  await createWord({ term: "Ultima", page: "home", position: 9999 });
  const next = await createWord({ term: "Dopo", page: "home" });
  assert.equal(next.position, 9999);
  assert.deepEqual(terms(await adminWords("?page=home")), ["Ultima", "Dopo"]);

  const elsewhere = await createWord({ term: "Altrove", page: "impatto" });
  const moved = await patch(elsewhere.id, { page: "home" });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.equal(moved.json.position, 9999);
});

// ---------------------------------------------------------------------------------------------------------------
// Changing
// ---------------------------------------------------------------------------------------------------------------

test("a patch changes only the fields it sends, and null removes the closing sentence", async () => {
  const word = await createWord({ closing: "Chiusa.", position: 4 });
  const res = await patch(word.id, { meaning: "Nuovo significato." });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual({ ...res.json, updatedAt: null }, { ...word, meaning: "Nuovo significato.", updatedAt: null });
  assert.ok(Date.parse(res.json.updatedAt) >= Date.parse(word.updatedAt));

  assert.equal((await patch(word.id, { closing: null })).json.closing, null);
  assert.equal((await patch(word.id, { closing: "Di nuovo." })).json.closing, "Di nuovo.");
});

test("a word moved to another page without a position goes last there; with one it takes that position", async () => {
  await createWord({ term: "Già qui", page: "programmi" });
  const word = await createWord({ term: "Disegnare", page: "home", position: 7 });

  const moved = await patch(word.id, { page: "programmi" });
  assert.equal(moved.status, 200, JSON.stringify(moved.json));
  assert.deepEqual([moved.json.page, moved.json.position], ["programmi", 1]);

  const placed = await patch(word.id, { page: "impatto", position: 3 });
  assert.deepEqual([placed.json.page, placed.json.position], ["impatto", 3]);

  // The same page again keeps the position; a position alone keeps the page.
  assert.equal((await patch(word.id, { page: "impatto" })).json.position, 3);
  const repositioned = await patch(word.id, { position: 0 });
  assert.deepEqual([repositioned.json.page, repositioned.json.position], ["impatto", 0]);
});

test("a patch body is validated: nothing to change, a blank required text and bad values are 400", async () => {
  const word = await createWord();
  const cases: [Record<string, unknown>, RegExp][] = [
    [{}, /^nothing to change$/],
    [{ term: "" }, /^term is required$/],
    [{ etymology: null }, /^etymology is required$/],
    [{ meaning: "   " }, /^meaning is required$/],
    [{ term: "Due\nrighe" }, /^term must be a single line$/],
    [{ page: "news" }, /^page must be one of: /],
    [{ page: null }, /^page must be one of: /],
    [{ position: -1 }, /^position must be an integer from 0 to 9999$/],
    [{ status: "ARCHIVED" }, /^status must be one of: DRAFT, PUBLISHED$/],
    [{ closing: 5 }, /^closing must be a string$/],
  ];
  for (const [body, error] of cases) {
    const res = await patch(word.id, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, error, JSON.stringify(body));
  }
  assert.deepEqual((await getOne(word.id)).json, word, "nothing changed");
});

test("the same term twice on one page is a 409; on another page, or with other letters, it is fine", async () => {
  await createWord();
  const twice = await post(wordBody());
  assert.deepEqual([twice.status, twice.json], [409, DUPLICATE]);
  // Spaces at the edges are removed first, so this is the same term.
  assert.equal((await post(wordBody({ term: "  Fondazione " }))).status, 409);
  assert.equal((await post(wordBody({ page: "home" }))).status, 201, "another page");
  assert.equal((await post(wordBody({ term: "fondazione" }))).status, 201, "the comparison is exact");
});

test("renaming or moving a word onto a term that its new page already has is a 409 and changes nothing", async () => {
  await createWord({ term: "Fondazione", page: "mateira" });
  const other = await createWord({ term: "Generare", page: "mateira" });
  const renamed = await patch(other.id, { term: "Fondazione" });
  assert.deepEqual([renamed.status, renamed.json], [409, DUPLICATE]);
  assert.equal((await getOne(other.id)).json.term, "Generare");

  const twin = await createWord({ term: "Fondazione", page: "home", position: 2 });
  const moved = await patch(twin.id, { page: "mateira" });
  assert.deepEqual([moved.status, moved.json], [409, DUPLICATE]);
  const after = (await getOne(twin.id)).json;
  assert.deepEqual([after.page, after.position], ["home", 2], "the refused move changed nothing");
});

test("simultaneous creations of the same term on one page: one 201, the others 409, never 500", async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () => post(wordBody())));
  assert.deepEqual(
    results.map((r) => r.status).sort(),
    [201, 409, 409, 409, 409],
    JSON.stringify(results.map((r) => r.json)),
  );
  assert.equal((await adminWords()).length, 1);
});

// ---------------------------------------------------------------------------------------------------------------
// Ids and deletes
// ---------------------------------------------------------------------------------------------------------------

test("unknown and malformed ids are 404", async () => {
  for (const id of [UNKNOWN_ID, "not-a-uuid", "123"]) {
    assert.equal((await getOne(id)).status, 404, id);
    assert.equal((await patch(id, { term: "X" })).status, 404, id);
    assert.equal((await request("DELETE", `${WORDS}/${id}`, { token })).status, 404, id);
  }
  assert.equal((await request("GET", `${WORDS}/${UNKNOWN_ID}/deeper`, { token })).status, 404);
  assert.equal((await request("PUT", WORDS, { token, body: {} })).status, 404);
});

test("delete removes the word everywhere and a second delete is a 404", async () => {
  const word = await createWord({ status: "PUBLISHED" });
  assert.equal((await request("DELETE", `${WORDS}/${word.id}`, { token })).status, 204);
  assert.deepEqual(await publicWords(), []);
  assert.deepEqual(await adminWords(), []);
  assert.equal((await request("DELETE", `${WORDS}/${word.id}`, { token })).status, 404);
});

test("concurrent deletes of the same word answer 204 once and 404 for the others", async () => {
  const word = await createWord();
  const results = await Promise.all(Array.from({ length: 5 }, () => request("DELETE", `${WORDS}/${word.id}`, { token })));
  assert.deepEqual(results.map((r) => r.status).sort(), [204, 404, 404, 404, 404]);
});

test("a patch racing a delete answers 200 or 404, never 500", async () => {
  for (let i = 0; i < 5; i++) {
    const word = await createWord({ term: `Corsa ${i}` });
    const [patched, deleted] = await Promise.all([
      patch(word.id, { meaning: "Cambiato." }),
      request("DELETE", `${WORDS}/${word.id}`, { token }),
    ]);
    assert.ok([200, 404].includes(patched.status), `patch answered ${patched.status}: ${JSON.stringify(patched.json)}`);
    assert.equal(deleted.status, 204);
  }
});
