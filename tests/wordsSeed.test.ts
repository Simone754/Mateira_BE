import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { seedWords } from "../src/modules/words/seed";
import { WORD_SEEDS } from "../src/modules/words/seedData";
import { parseWordCreate } from "../src/modules/words/service";
import { prisma } from "../src/plugins/prisma";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";
import { loginAsAdmin } from "./helpers/auth";

let request: Requester;
let close: () => Promise<void>;

before(async () => {
  ({ request, close } = await startTestServer());
});

after(async () => {
  await close();
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
});

const byTerm = (term: string) => prisma.word.findFirstOrThrow({ where: { term } });

test("every seed respects the rules of the API and comes out of them unchanged", () => {
  for (const seed of WORD_SEEDS) {
    const parsed = parseWordCreate({ ...seed });
    assert.deepEqual(
      [parsed.term, parsed.etymology, parsed.meaning, parsed.closing, parsed.page, parsed.status],
      [seed.term, seed.etymology, seed.meaning, seed.closing, seed.page, seed.status],
      seed.term,
    );
  }
});

test("the first run creates the six words with their pages and states", async () => {
  const outcomes = await seedWords();
  assert.deepEqual(outcomes, [
    { term: "MATEIRA", page: "home", outcome: "created" },
    { term: "Fondazione", page: "mateira", outcome: "created" },
    { term: "Generare", page: "come-lavoriamo", outcome: "created" },
    { term: "Disegnare", page: "programmi", outcome: "created" },
    { term: "Trasformazione", page: "impatto", outcome: "created" },
    { term: "Viaggio", page: "viaggio-dei-tirenauti", outcome: "created" },
  ]);

  const rows = await prisma.word.findMany();
  const state = Object.fromEntries(rows.map((r) => [r.term, [r.status, r.publishedAt !== null, r.position]]));
  assert.deepEqual(state, {
    MATEIRA: ["DRAFT", false, 0],
    Fondazione: ["PUBLISHED", true, 0],
    Generare: ["PUBLISHED", true, 0],
    Disegnare: ["DRAFT", false, 0],
    Trasformazione: ["DRAFT", false, 0],
    Viaggio: ["PUBLISHED", true, 0],
  });

  const res = await request("GET", "/api/public/words");
  assert.deepEqual(
    res.json.words.map((w: { term: string }) => w.term),
    ["Fondazione", "Generare", "Viaggio"],
  );
});

test("the texts are stored exactly as the data file has them", async () => {
  await seedWords();
  for (const seed of WORD_SEEDS) {
    const row = await byTerm(seed.term);
    assert.deepEqual([row.etymology, row.meaning, row.closing], [seed.etymology, seed.meaning, seed.closing], seed.term);
  }

  // A few exact checks on the typographic characters and on the paragraphs.
  assert.equal(
    (await byTerm("Fondazione")).etymology,
    "Dal latino FUNDUS, I: “ciò su cui qualcosa può poggiare”; “scavare fino al sodo”; “fondato motivo, ragione valida”; “porre ferma speranza”.",
  );
  const generare = await byTerm("Generare");
  assert.equal(generare.meaning.split("\n\n").length, 2);
  assert.ok(generare.meaning.endsWith("Una relazione può diventare collaborazione.\nUn’esperienza può aprire una nuova possibilità."));
  assert.equal((await byTerm("Viaggio")).closing, null);
  assert.equal((await byTerm("Trasformazione")).closing, "EREDITÀ → CAPACITÀ → POSSIBILITÀ");
  assert.ok((await byTerm("Disegnare")).etymology.endsWith("\n\nCO-DESIGN: “tracciare insieme ad altri la relazione tra cose o idee”."));
});

test("a second run creates nothing and leaves a word edited from the panel as it is", async () => {
  await seedWords();
  const { token } = await loginAsAdmin(request);
  const fondazione = await byTerm("Fondazione");
  const edited = await request("PATCH", `/api/admin/words/${fondazione.id}`, {
    token,
    body: { meaning: "Testo corretto dal pannello.", status: "DRAFT" },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.json));

  const outcomes = await seedWords();
  assert.ok(outcomes.every((o) => o.outcome === "existing"), JSON.stringify(outcomes));
  assert.equal(await prisma.word.count(), 6);
  const after = await prisma.word.findUniqueOrThrow({ where: { id: fondazione.id } });
  assert.equal(after.meaning, "Testo corretto dal pannello.");
  assert.equal(after.status, "DRAFT");
});

test("a word deleted from the panel comes back on the next run, at the end of its page", async () => {
  await seedWords();
  await prisma.word.deleteMany({ where: { term: "Viaggio" } });
  await prisma.word.create({
    data: { term: "Altra", etymology: "E.", meaning: "M.", page: "viaggio-dei-tirenauti", position: 0 },
  });

  const outcomes = await seedWords();
  assert.deepEqual(
    outcomes.filter((o) => o.outcome === "created"),
    [{ term: "Viaggio", page: "viaggio-dei-tirenauti", outcome: "created" }],
  );
  assert.equal((await byTerm("Viaggio")).position, 1);
});

test("two runs at the same time create each word once and do not fail", async () => {
  const [a, b] = await Promise.all([seedWords(), seedWords()]);
  assert.equal(await prisma.word.count(), 6);
  for (let i = 0; i < WORD_SEEDS.length; i++) {
    assert.deepEqual([a[i].outcome, b[i].outcome].sort(), ["created", "existing"], a[i].term);
  }
});
