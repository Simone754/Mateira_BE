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

const PUBS = "/api/admin/publications";
const PUBLIC = "/api/public/publications";
const UNKNOWN_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";
const URL_A = "https://example.org/report.pdf";
const BOTH_OR_NONE = "a file or an external URL is required, not both";
const TYPES = [
  "RESEARCH", "REPORT", "PAPER", "PUBLICATION", "DATA", "ATLAS", "SCENARIO", "CITIZEN_SCIENCE", "LIVING_ARCHIVE",
];

const post = (body: unknown) => request("POST", PUBS, { token, body });
const patch = (id: string, body: unknown) => request("PATCH", `${PUBS}/${id}`, { token, body });
const getOne = (id: string) => request("GET", `${PUBS}/${id}`, { token });

async function createMedia(mimeType = "application/pdf") {
  return prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey(mimeType), mimeType, size: 1234, alt: "Report" },
  });
}

async function createPub(body: Record<string, unknown> = {}) {
  const res = await post({ title: "Report 2026", type: "REPORT", date: "2026-03-01", externalUrl: URL_A, ...body });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function listPublic(query = ""): Promise<any> {
  const res = await request("GET", `${PUBLIC}${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json;
}

const titles = (items: any[]) => items.map((p) => p.title);

test("every admin route needs the admin token", async () => {
  const created = await createPub();
  const byId = `${PUBS}/${created.id}`;
  const routes: [string, string, unknown?][] = [
    ["GET", PUBS],
    ["POST", PUBS, { title: "x" }],
    ["GET", byId],
    ["PATCH", byId, { title: "Manomesso" }],
    ["DELETE", byId],
  ];
  for (const [method, path, body] of routes) {
    assert.equal((await request(method, path, { body })).status, 401, `${method} ${path}`);
  }
  assert.equal((await request("GET", PUBS, { token })).headers.get("cache-control"), "no-store");
});

test("a publication is created as a draft; every type is accepted", async () => {
  const pub = await createPub({ date: "2026-03-01T23:30:00-05:00" });
  assert.deepEqual(Object.keys(pub).sort(), [
    "abstract", "authors", "createdAt", "date", "externalUrl", "file", "id", "publishedAt",
    "status", "title", "type", "updatedAt",
  ]);
  assert.deepEqual(
    [pub.title, pub.type, pub.authors, pub.date, pub.abstract, pub.file, pub.externalUrl, pub.status, pub.publishedAt],
    ["Report 2026", "REPORT", null, "2026-03-02T00:00:00.000Z", null, null, URL_A, "DRAFT", null],
  );
  for (const type of TYPES) await createPub({ type });

  const full = await createPub({
    status: "PUBLISHED", authors: " A. Rossi, M. Bianchi ", abstract: "Uno.\r\n\r\nDue.", externalUrl: null,
    fileId: (await createMedia()).id,
  });
  assert.ok(Date.parse(full.publishedAt) > 0);
  assert.equal(full.authors, "A. Rossi, M. Bianchi");
  assert.equal(full.abstract, "Uno.\n\nDue.");
  assert.deepEqual(Object.keys(full.file).sort(), ["alt", "id", "mimeType", "url"]);
  assert.equal((await getOne(full.id)).json.file.id, full.file.id);
  const empties = await createPub({ authors: "", abstract: "  " });
  assert.deepEqual([empties.authors, empties.abstract], [null, null]);
});

test("invalid values are 400", async () => {
  const pdf = await createMedia();
  const image = await createMedia("image/webp");
  assert.equal(
    (await post({
      title: "t".repeat(200), type: "PAPER", date: "2026-01-01", authors: "a".repeat(300),
      abstract: "b".repeat(3000), externalUrl: URL_A,
    })).status,
    201,
  );
  const bad: Record<string, unknown>[] = [
    { title: "" },
    { title: "t".repeat(201) },
    { title: "Due\nrighe" },
    { title: 5 },
    { type: "OTHER" },
    { type: "" },
    { type: "report" },
    { date: "ieri" },
    { authors: "a".repeat(301) },
    { authors: "a\nb" },
    { authors: 3 },
    { abstract: "b".repeat(3001) },
    { abstract: "x\u0000y" },
    { status: "OTHER" },
    { extra: 1 },
    { category: "INSTITUTIONAL" },
    { section: "S" },
    { externalUrl: "not a url" },
    { externalUrl: "ftp://example.org/a" },
    { externalUrl: `https://example.org/${"a".repeat(481)}` },
    { fileId: "no" },
    { fileId: UNKNOWN_ID, externalUrl: null },
    { fileId: image.id, externalUrl: null },
    { fileId: pdf.id },
    { externalUrl: null },
  ];
  for (const extra of bad) {
    const body = { title: "Valida", type: "REPORT", date: "2026-01-01", externalUrl: URL_A, ...extra };
    assert.equal((await post(body)).status, 400, JSON.stringify(extra));
  }
  for (const missing of ["title", "type", "date"]) {
    const body: Record<string, unknown> = { title: "Valida", type: "REPORT", date: "2026-01-01", externalUrl: URL_A };
    delete body[missing];
    assert.equal((await post(body)).status, 400, `missing ${missing}`);
  }
  assert.equal((await request("GET", PUBS, { token })).json.total, 1, "refused requests created nothing");

  const base = { title: "x", type: "REPORT", date: "2026-01-01" };
  assert.equal((await post({ ...base, fileId: pdf.id, externalUrl: URL_A })).json.error, BOTH_OR_NONE);
  assert.equal((await post(base)).json.error, BOTH_OR_NONE);
  assert.match((await post({ ...base, fileId: image.id })).json.error, /PDF/);
  assert.equal((await request("POST", PUBS, { token, body: "x" })).status, 400);
});

test("PATCH changes some fields and keeps the others", async () => {
  const pub = await createPub({ authors: "A. Rossi", abstract: "Nota" });
  const res = await patch(pub.id, { title: "Nuovo", type: "ATLAS", date: "2026-05-05T10:00:00Z" });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(
    [res.json.title, res.json.type, res.json.date, res.json.authors, res.json.abstract, res.json.externalUrl],
    ["Nuovo", "ATLAS", "2026-05-05T00:00:00.000Z", "A. Rossi", "Nota", URL_A],
  );
  const cleared = await patch(pub.id, { authors: null, abstract: "" });
  assert.deepEqual([cleared.json.authors, cleared.json.abstract], [null, null]);

  for (const body of [{}, { extra: 1 }, { title: "" }, { type: "OTHER" }, { status: "OTHER" }, { authors: "a".repeat(301) }]) {
    assert.equal((await patch(pub.id, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await patch(UNKNOWN_ID, { title: "x" })).status, 404);
  assert.equal((await patch("non-un-uuid", { title: "x" })).status, 404);
});

test("PATCH goes from a link to a file and back in one body, and never leaves both or none", async () => {
  const pdf = await createMedia();
  const image = await createMedia("image/png");
  const pub = await createPub();

  const both = await patch(pub.id, { fileId: pdf.id });
  assert.equal(both.status, 400);
  assert.equal(both.json.error, BOTH_OR_NONE);
  assert.equal((await patch(pub.id, { externalUrl: null })).status, 400);
  assert.equal((await patch(pub.id, { fileId: image.id, externalUrl: null })).status, 400);
  assert.equal((await patch(pub.id, { fileId: UNKNOWN_ID, externalUrl: null })).status, 400);
  assert.equal((await getOne(pub.id)).json.externalUrl, URL_A);

  const toFile = await patch(pub.id, { fileId: pdf.id, externalUrl: null });
  assert.equal(toFile.status, 200, JSON.stringify(toFile.json));
  assert.deepEqual([toFile.json.file.id, toFile.json.externalUrl], [pdf.id, null]);
  assert.equal((await patch(pub.id, { externalUrl: "https://example.org/b" })).status, 400);
  assert.equal((await patch(pub.id, { fileId: null })).status, 400);
  const back = await patch(pub.id, { fileId: null, externalUrl: "https://example.org/b" });
  assert.deepEqual([back.status, back.json.file, back.json.externalUrl], [200, null, "https://example.org/b"]);
});

test("publishedAt is set once and kept when the publication goes back to a draft", async () => {
  const pub = await createPub();
  const published = await patch(pub.id, { status: "PUBLISHED" });
  assert.ok(Date.parse(published.json.publishedAt) > 0);
  assert.equal((await patch(pub.id, { status: "DRAFT" })).json.publishedAt, published.json.publishedAt);
  assert.equal((await patch(pub.id, { status: "PUBLISHED" })).json.publishedAt, published.json.publishedAt);
});

test("DELETE removes the publication and a second one is 404", async () => {
  const pub = await createPub();
  assert.equal((await request("DELETE", `${PUBS}/${pub.id}`, { token })).status, 204);
  assert.equal((await request("DELETE", `${PUBS}/${pub.id}`, { token })).status, 404);
  assert.equal((await getOne(pub.id)).status, 404);
});

test("the admin list filters by type and status, paginates and rejects wrong values", async () => {
  await createPub({ title: "A", type: "PAPER", status: "PUBLISHED", date: "2026-01-01" });
  await createPub({ title: "B", type: "DATA", date: "2026-02-01" });
  await createPub({ title: "C", type: "DATA", status: "PUBLISHED", date: "2026-03-01" });
  const list = async (q: string) => (await request("GET", `${PUBS}${q}`, { token })).json;
  assert.deepEqual(titles((await list("")).items), ["C", "B", "A"]);
  assert.deepEqual(titles((await list("?type=DATA")).items), ["C", "B"]);
  assert.deepEqual(titles((await list("?status=PUBLISHED")).items), ["C", "A"]);
  assert.deepEqual(titles((await list("?type=DATA&status=DRAFT")).items), ["B"]);
  const page2 = await list("?limit=2&page=2");
  assert.deepEqual([titles(page2.items), page2.page, page2.limit, page2.total], [["A"], 2, 2, 3]);
  assert.equal((await list("")).limit, 20);
  assert.equal((await list("?limit=500")).limit, 100);
  for (const q of ["?type=", "?type=OTHER", "?status=", "?status=OTHER"]) {
    assert.equal((await request("GET", `${PUBS}${q}`, { token })).status, 400, q);
  }
});

test("the public list shows only published publications with a link, newest first", async () => {
  const pdf = await createMedia();
  await createPub({ title: "Vecchia", date: "2025-01-01", status: "PUBLISHED", authors: "A. Rossi", abstract: "Sintesi" });
  await createPub({ title: "Con file", date: "2026-06-01", status: "PUBLISHED", externalUrl: null, fileId: pdf.id });
  await createPub({ title: "Bozza", date: "2027-01-01" });
  const res = await listPublic();
  assert.deepEqual(titles(res.items), ["Con file", "Vecchia"]);
  assert.deepEqual([res.page, res.limit, res.total], [1, 12, 2]);
  assert.deepEqual(Object.keys(res.items[0]).sort(), ["abstract", "authors", "date", "id", "link", "title", "type"]);
  assert.deepEqual(res.items[0].link, { url: res.items[0].link.url, kind: "file", mimeType: "application/pdf" });
  assert.match(res.items[0].link.url, /\.pdf$/);
  assert.deepEqual(res.items[1].link, { url: URL_A, kind: "external", mimeType: null });
  assert.deepEqual([res.items[1].authors, res.items[1].abstract, res.items[1].date], ["A. Rossi", "Sintesi", "2025-01-01T00:00:00.000Z"]);
});

test("the public list filters by type and paginates", async () => {
  for (let n = 1; n <= 5; n++) {
    await createPub({ title: `P${n}`, type: n % 2 ? "PAPER" : "ATLAS", date: `2026-0${n}-01`, status: "PUBLISHED" });
  }
  assert.deepEqual(titles((await listPublic("?type=PAPER")).items), ["P5", "P3", "P1"]);
  assert.equal((await listPublic("?type=PAPER")).total, 3);
  assert.deepEqual(titles((await listPublic("?type=LIVING_ARCHIVE")).items), []);
  const page = await listPublic("?limit=2&page=3");
  assert.deepEqual([titles(page.items), page.page, page.limit, page.total], [["P1"], 3, 2, 5]);
  assert.equal((await listPublic("?limit=1000")).limit, 50);
  assert.equal((await listPublic("?limit=abc&page=-4")).limit, 12);
  for (const q of ["?type=", "?type=OTHER", "?type=paper"]) {
    const res = await request("GET", `${PUBLIC}${q}`);
    assert.equal(res.status, 400, q);
    assert.ok(res.json.error);
  }
  assert.equal((await request("POST", PUBLIC, { body: {} })).status, 404);
});

test("same day: creation order, then id", async () => {
  await createPub({ title: "Prima", status: "PUBLISHED" });
  await createPub({ title: "Seconda", status: "PUBLISHED" });
  assert.deepEqual(titles((await listPublic()).items), ["Prima", "Seconda"]);
});

test("a published publication whose PDF was deleted leaves the public list and the panel shows it without a file", async () => {
  const pdf = await createMedia();
  const pub = await createPub({ externalUrl: null, fileId: pdf.id, status: "PUBLISHED" });
  await createPub({ title: "Resta", status: "PUBLISHED" });
  assert.equal((await listPublic()).total, 2);

  await prisma.media.delete({ where: { id: pdf.id } });
  const res = await listPublic();
  assert.deepEqual([titles(res.items), res.total], [["Resta"], 1]);
  const admin = await getOne(pub.id);
  assert.deepEqual([admin.json.file, admin.json.externalUrl, admin.json.status], [null, null, "PUBLISHED"]);
  assert.equal((await patch(pub.id, { externalUrl: "https://example.org/nuovo" })).status, 200);
  assert.equal((await listPublic()).total, 2);
});

test("concurrent writes never end in a 500", async () => {
  const pdf = await createMedia();
  const pub = await createPub();
  const results = await Promise.all([
    request("DELETE", `${PUBS}/${pub.id}`, { token }),
    patch(pub.id, { title: "Uno" }),
    patch(pub.id, { fileId: pdf.id, externalUrl: null }),
    patch(pub.id, { externalUrl: "https://example.org/z" }),
  ]);
  for (const r of results) assert.ok([200, 204, 400, 404].includes(r.status), String(r.status));

  const second = await createPub({ title: "Due" });
  const racing = await Promise.all([
    patch(second.id, { fileId: pdf.id, externalUrl: null }),
    patch(second.id, { externalUrl: "https://example.org/y" }),
    patch(second.id, { fileId: pdf.id }),
  ]);
  for (const r of racing) assert.ok([200, 400].includes(r.status), String(r.status));
  const row = await prisma.publication.findUniqueOrThrow({ where: { id: second.id } });
  assert.ok((row.fileId === null) !== (row.externalUrl === null), "exactly one of file and link survives");

  const gone = await createMedia();
  const media = await Promise.all([
    prisma.media.delete({ where: { id: gone.id } }),
    post({ title: "Corsa", type: "REPORT", date: "2026-01-01", fileId: gone.id }),
  ]);
  assert.ok([201, 400].includes(media[1].status), String(media[1].status));
});
