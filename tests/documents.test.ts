import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/plugins/prisma";
import { newObjectKey } from "../src/modules/media/service";
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

const DOCS = "/api/admin/documents";
const PUBLIC = "/api/public/documents";
const UNKNOWN_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";
const URL_A = "https://example.org/statuto.pdf";
const BOTH_OR_NONE = "a file or an external URL is required, not both";

const post = (body: unknown) => request("POST", DOCS, { token, body });
const patch = (id: string, body: unknown) => request("PATCH", `${DOCS}/${id}`, { token, body });
const getOne = (id: string) => request("GET", `${DOCS}/${id}`, { token });

async function createMedia(mimeType = "application/pdf", alt: string | null = "Statuto") {
  return prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey(mimeType), mimeType, size: 1234, alt },
  });
}

async function createDoc(body: Record<string, unknown> = {}) {
  const res = await post({
    title: "Statuto",
    category: "INSTITUTIONAL",
    date: "2026-03-01",
    externalUrl: URL_A,
    ...body,
  });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function listPublic(category: string): Promise<any[]> {
  const res = await request("GET", `${PUBLIC}?category=${category}`);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.documents;
}

const titles = (docs: any[]) => docs.map((d) => d.title);

test("every admin route needs the admin token", async () => {
  const created = await createDoc();
  const byId = `${DOCS}/${created.id}`;
  const routes: [string, string, unknown?][] = [
    ["GET", DOCS],
    ["POST", DOCS, { title: "x" }],
    ["GET", byId],
    ["PATCH", byId, { title: "Manomesso" }],
    ["DELETE", byId],
  ];
  for (const [method, path, body] of routes) {
    assert.equal((await request(method, path, { body })).status, 401, `${method} ${path}`);
  }
  assert.equal((await request("GET", DOCS, { token })).headers.get("cache-control"), "no-store");
});

test("a document is created as a draft with a link and the day of its date", async () => {
  const doc = await createDoc({ date: "2026-03-01T18:30:00+02:00" });
  assert.deepEqual(Object.keys(doc).sort(), [
    "category", "createdAt", "date", "description", "externalUrl", "file", "id", "publishedAt",
    "section", "status", "title", "updatedAt",
  ]);
  assert.deepEqual(
    [doc.title, doc.category, doc.section, doc.date, doc.description, doc.file, doc.externalUrl, doc.status, doc.publishedAt],
    ["Statuto", "INSTITUTIONAL", null, "2026-03-01T00:00:00.000Z", null, null, URL_A, "DRAFT", null],
  );
  const published = await createDoc({
    status: "PUBLISHED", section: "  Bilanci ", description: "Prima.\r\n\r\nSeconda.", externalUrl: "",
    fileId: (await createMedia()).id,
  });
  assert.ok(Date.parse(published.publishedAt) > 0);
  assert.equal(published.section, "Bilanci");
  assert.equal(published.description, "Prima.\n\nSeconda.");
  assert.equal(published.externalUrl, null);
  assert.deepEqual(Object.keys(published.file).sort(), ["alt", "id", "mimeType", "url"]);
  assert.equal(published.file.mimeType, "application/pdf");
  assert.equal((await getOne(published.id)).json.file.id, published.file.id);
});

test("empty optional fields are null", async () => {
  const doc = await createDoc({ section: "  ", description: "" });
  assert.deepEqual([doc.section, doc.description], [null, null]);
});

test("invalid values are 400", async () => {
  const pdf = await createMedia();
  const image = await createMedia("image/png");
  assert.equal(
    (await post({
      title: "t".repeat(200), category: "TRANSPARENCY", date: "2026-01-01", section: "s".repeat(120),
      description: "d".repeat(1000), externalUrl: `https://example.org/${"a".repeat(470)}`,
    })).status,
    201,
  );
  const bad: Record<string, unknown>[] = [
    { title: "" },
    { title: "   " },
    { title: "t".repeat(201) },
    { title: "Due\nrighe" },
    { title: "Nul\u0000" },
    { title: 5 },
    { category: "OTHER" },
    { category: "" },
    { date: "ieri" },
    { date: 20260101 },
    { section: "s".repeat(121) },
    { section: "a\nb" },
    { section: 3 },
    { description: "d".repeat(1001) },
    { status: "OTHER" },
    { extra: 1 },
    { externalUrl: "not a url" },
    { externalUrl: "ftp://example.org/a.pdf" },
    { externalUrl: "javascript:alert(1)" },
    { externalUrl: `https://example.org/${"a".repeat(481)}` },
    { externalUrl: 5 },
    { fileId: "no" },
    { fileId: UNKNOWN_ID, externalUrl: null },
    { fileId: image.id, externalUrl: null },
    { fileId: pdf.id },
    { fileId: pdf.id, externalUrl: URL_A },
    { externalUrl: null },
    { externalUrl: "" },
  ];
  for (const extra of bad) {
    const body: Record<string, unknown> = {
      title: "Valido", category: "INSTITUTIONAL", date: "2026-01-01", externalUrl: URL_A, ...extra,
    };
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(extra));
  }
  for (const missing of ["title", "category", "date"]) {
    const body: Record<string, unknown> = { title: "Valido", category: "INSTITUTIONAL", date: "2026-01-01", externalUrl: URL_A };
    delete body[missing];
    assert.equal((await post(body)).status, 400, `missing ${missing}`);
  }
  assert.equal((await request("GET", DOCS, { token })).json.documents.length, 1, "refused requests created nothing");

  const both = await post({ title: "x", category: "INSTITUTIONAL", date: "2026-01-01", fileId: pdf.id, externalUrl: URL_A });
  assert.equal(both.json.error, BOTH_OR_NONE);
  const none = await post({ title: "x", category: "INSTITUTIONAL", date: "2026-01-01" });
  assert.equal(none.json.error, BOTH_OR_NONE);
  const notPdf = await post({ title: "x", category: "INSTITUTIONAL", date: "2026-01-01", fileId: image.id });
  assert.match(notPdf.json.error, /PDF/);
  assert.equal((await request("POST", DOCS, { token, body: [] })).status, 400);
});

test("the database refuses a file and an external URL together", async () => {
  const pdf = await createMedia();
  await assert.rejects(
    prisma.document.create({
      data: { title: "x", category: "INSTITUTIONAL", date: new Date(), fileId: pdf.id, externalUrl: URL_A },
    }),
  );
  await assert.rejects(
    prisma.publication.create({
      data: { title: "x", type: "REPORT", date: new Date(), fileId: pdf.id, externalUrl: URL_A },
    }),
  );
  // neither of the two is what a deleted file leaves: allowed
  await prisma.document.create({ data: { title: "x", category: "INSTITUTIONAL", date: new Date() } });
});

test("the external URL is normalised like the links of the news", async () => {
  const doc = await createDoc({ externalUrl: "HTTPS://Example.org/a b.pdf" });
  assert.equal(doc.externalUrl, "https://example.org/a%20b.pdf");
});

test("PATCH changes some fields and keeps the others", async () => {
  const doc = await createDoc({ section: "Bilanci", description: "Nota" });
  const res = await patch(doc.id, { title: "Nuovo", category: "TRANSPARENCY", date: "2026-05-05T10:00:00Z" });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(
    [res.json.title, res.json.category, res.json.date, res.json.section, res.json.description, res.json.externalUrl],
    ["Nuovo", "TRANSPARENCY", "2026-05-05T00:00:00.000Z", "Bilanci", "Nota", URL_A],
  );
  const cleared = await patch(doc.id, { section: null, description: "" });
  assert.deepEqual([cleared.json.section, cleared.json.description], [null, null]);
  assert.ok(Date.parse(cleared.json.updatedAt) >= Date.parse(doc.updatedAt));

  assert.equal((await patch(doc.id, {})).status, 400);
  assert.equal((await patch(doc.id, { extra: 1 })).status, 400);
  assert.equal((await patch(doc.id, { title: "" })).status, 400);
  assert.equal((await patch(doc.id, { category: "OTHER" })).status, 400);
  assert.equal((await patch(doc.id, { status: "OTHER" })).status, 400);
  assert.equal((await patch(UNKNOWN_ID, { title: "x" })).status, 404);
  assert.equal((await patch("non-un-uuid", { title: "x" })).status, 404);
});

test("PATCH goes from a link to a file and back in one body, and never leaves both or none", async () => {
  const pdf = await createMedia();
  const image = await createMedia("image/jpeg");
  const doc = await createDoc();

  const both = await patch(doc.id, { fileId: pdf.id });
  assert.equal(both.status, 400);
  assert.equal(both.json.error, BOTH_OR_NONE);
  const none = await patch(doc.id, { externalUrl: null });
  assert.equal(none.status, 400);
  assert.equal((await patch(doc.id, { fileId: image.id, externalUrl: null })).status, 400);
  assert.equal((await patch(doc.id, { fileId: UNKNOWN_ID, externalUrl: null })).status, 400);
  assert.equal((await getOne(doc.id)).json.externalUrl, URL_A, "refused patches changed nothing");

  const toFile = await patch(doc.id, { fileId: pdf.id, externalUrl: null });
  assert.equal(toFile.status, 200, JSON.stringify(toFile.json));
  assert.deepEqual([toFile.json.file.id, toFile.json.externalUrl], [pdf.id, null]);

  assert.equal((await patch(doc.id, { externalUrl: "https://example.org/b" })).status, 400);
  assert.equal((await patch(doc.id, { fileId: null })).status, 400);
  const back = await patch(doc.id, { fileId: null, externalUrl: "https://example.org/b" });
  assert.equal(back.status, 200, JSON.stringify(back.json));
  assert.deepEqual([back.json.file, back.json.externalUrl], [null, "https://example.org/b"]);

  const other = await createMedia();
  const swap = await patch(doc.id, { fileId: other.id, externalUrl: "" });
  assert.deepEqual([swap.json.file.id, swap.json.externalUrl], [other.id, null]);
  const same = await patch(doc.id, { title: "Solo titolo" });
  assert.equal(same.status, 200);
  assert.equal(same.json.file.id, other.id);
});

test("publishedAt is set once and kept when the document goes back to a draft", async () => {
  const doc = await createDoc();
  const published = await patch(doc.id, { status: "PUBLISHED" });
  assert.ok(Date.parse(published.json.publishedAt) > 0);
  const draft = await patch(doc.id, { status: "DRAFT" });
  assert.equal(draft.json.publishedAt, published.json.publishedAt);
  const again = await patch(doc.id, { status: "PUBLISHED" });
  assert.equal(again.json.publishedAt, published.json.publishedAt);
});

test("DELETE removes the document and a second one is 404", async () => {
  const doc = await createDoc();
  assert.equal((await request("DELETE", `${DOCS}/${doc.id}`, { token })).status, 204);
  assert.equal((await request("DELETE", `${DOCS}/${doc.id}`, { token })).status, 404);
  assert.equal((await getOne(doc.id)).status, 404);
  assert.equal((await request("DELETE", `${DOCS}/non-un-uuid`, { token })).status, 404);
});

test("the admin list filters by category and status and rejects wrong values", async () => {
  await createDoc({ title: "A", category: "INSTITUTIONAL", status: "PUBLISHED" });
  await createDoc({ title: "B", category: "TRANSPARENCY" });
  await createDoc({ title: "C", category: "TRANSPARENCY", status: "PUBLISHED" });
  const list = async (q: string) => (await request("GET", `${DOCS}${q}`, { token })).json.documents;
  assert.equal((await list("")).length, 3);
  assert.deepEqual(titles(await list("?category=TRANSPARENCY")).sort(), ["B", "C"]);
  assert.deepEqual(titles(await list("?status=PUBLISHED")).sort(), ["A", "C"]);
  assert.deepEqual(titles(await list("?category=TRANSPARENCY&status=DRAFT")), ["B"]);
  for (const q of ["?category=", "?category=OTHER", "?status=", "?status=OTHER"]) {
    assert.equal((await request("GET", `${DOCS}${q}`, { token })).status, 400, q);
  }
});

test("the public list needs a valid category", async () => {
  for (const q of ["", "?category=", "?category=OTHER", "?category=institutional"]) {
    const res = await request("GET", `${PUBLIC}${q}`);
    assert.equal(res.status, 400, q);
    assert.ok(res.json.error);
  }
  assert.equal((await request("POST", `${PUBLIC}?category=INSTITUTIONAL`, { body: {} })).status, 404);
});

test("the public list shows only published documents of the category, with the link", async () => {
  const pdf = await createMedia();
  await createDoc({ title: "Con file", externalUrl: null, fileId: pdf.id, status: "PUBLISHED", section: "S", description: "Nota" });
  await createDoc({ title: "Con link", status: "PUBLISHED", section: "S" });
  await createDoc({ title: "Bozza" });
  await createDoc({ title: "Altra categoria", category: "TRANSPARENCY", status: "PUBLISHED" });

  const docs = await listPublic("INSTITUTIONAL");
  assert.deepEqual(titles(docs), ["Con file", "Con link"]);
  assert.deepEqual(Object.keys(docs[0]).sort(), ["date", "description", "id", "link", "section", "title"]);
  assert.deepEqual(Object.keys(docs[0].link).sort(), ["kind", "mimeType", "url"]);
  assert.deepEqual(docs[0].link, { url: docs[0].link.url, kind: "file", mimeType: "application/pdf" });
  assert.match(docs[0].link.url, /^http:\/\/localhost:9100\/mateira-media\/media\/\d{4}\/.+\.pdf$/);
  assert.deepEqual(docs[1].link, { url: URL_A, kind: "external", mimeType: null });
  assert.equal(docs[0].description, "Nota");
  assert.equal(docs[0].date, "2026-03-01T00:00:00.000Z");
  assert.deepEqual(titles(await listPublic("TRANSPARENCY")), ["Altra categoria"]);
});

test("a published document whose PDF was deleted leaves the public list and the panel shows it without a file", async () => {
  const pdf = await createMedia();
  const doc = await createDoc({ externalUrl: null, fileId: pdf.id, status: "PUBLISHED" });
  await createDoc({ title: "Resta", status: "PUBLISHED" });
  assert.equal((await listPublic("INSTITUTIONAL")).length, 2);

  await prisma.media.delete({ where: { id: pdf.id } });
  assert.deepEqual(titles(await listPublic("INSTITUTIONAL")), ["Resta"]);
  const admin = await getOne(doc.id);
  assert.equal(admin.status, 200);
  assert.deepEqual([admin.json.file, admin.json.externalUrl, admin.json.status], [null, null, "PUBLISHED"]);

  // The item can be repaired with a link, and then it is back
  const repaired = await patch(doc.id, { externalUrl: "https://example.org/nuovo.pdf" });
  assert.equal(repaired.status, 200);
  assert.equal((await listPublic("INSTITUTIONAL")).length, 2);
});

test("the public list is ordered by section, then date newest first", async () => {
  const mk = (title: string, section: string | null, date: string) =>
    createDoc({ title, section, date, status: "PUBLISHED" });
  await mk("Senza sezione recente", null, "2026-09-01");
  await mk("Bilanci 2024", "bilanci", "2025-01-01");
  await mk("Statuto vecchio", "Statuto e regolamenti", "2024-01-01");
  await mk("Bilanci 2025", "Bilanci", "2026-01-01");
  await mk("Atti", "Atti", "2020-01-01");
  await mk("Statuto nuovo", "Statuto e regolamenti", "2026-02-01");
  await mk("Senza sezione vecchio", null, "2021-01-01");
  assert.deepEqual(titles(await listPublic("INSTITUTIONAL")), [
    "Atti",
    "Bilanci 2025",
    "Bilanci 2024",
    "Statuto nuovo",
    "Statuto vecchio",
    "Senza sezione recente",
    "Senza sezione vecchio",
  ]);
});

test("same section and day: creation date, then id", async () => {
  await createDoc({ title: "Primo", section: "S", status: "PUBLISHED" });
  await createDoc({ title: "Secondo", section: "S", status: "PUBLISHED" });
  assert.deepEqual(titles(await listPublic("INSTITUTIONAL")), ["Primo", "Secondo"]);
});

test("concurrent writes never end in a 500", async () => {
  const pdf = await createMedia();
  const doc = await createDoc();
  const results = await Promise.all([
    request("DELETE", `${DOCS}/${doc.id}`, { token }),
    patch(doc.id, { title: "Uno" }),
    patch(doc.id, { fileId: pdf.id, externalUrl: null }),
    patch(doc.id, { externalUrl: "https://example.org/z" }),
  ]);
  for (const r of results) assert.ok([200, 204, 400, 404].includes(r.status), String(r.status));

  const second = await createDoc({ title: "Due" });
  const racing = await Promise.all([
    patch(second.id, { fileId: pdf.id, externalUrl: null }),
    patch(second.id, { externalUrl: "https://example.org/y" }),
    patch(second.id, { fileId: pdf.id }),
  ]);
  for (const r of racing) assert.ok([200, 400].includes(r.status), String(r.status));
  const row = await prisma.document.findUniqueOrThrow({ where: { id: second.id } });
  assert.ok((row.fileId === null) !== (row.externalUrl === null), "exactly one of file and link survives");

  const gone = await createMedia();
  const media = await Promise.all([
    prisma.media.delete({ where: { id: gone.id } }),
    post({ title: "Corsa", category: "INSTITUTIONAL", date: "2026-01-01", fileId: gone.id }),
  ]);
  assert.ok([201, 400].includes(media[1].status), String(media[1].status));
});
