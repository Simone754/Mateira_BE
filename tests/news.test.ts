import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

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

function newsBody(overrides: Record<string, unknown> = {}) {
  return {
    title: "Nasce la Fondazione",
    date: "2026-10-01T09:00:00Z",
    category: "MATEIRA",
    body: "Primo paragrafo.\n\nSecondo paragrafo.",
    ...overrides,
  };
}

async function createNews(overrides: Record<string, unknown> = {}) {
  const res = await request("POST", "/api/admin/news", { token, body: newsBody(overrides) });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

test("admin news routes need the admin token", async () => {
  assert.equal((await request("GET", "/api/admin/news")).status, 401);
  assert.equal((await request("POST", "/api/admin/news", { body: newsBody() })).status, 401);
});

test("creating news makes a draft with a slug from the title", async () => {
  const created = await createNews({ title: "Più ricerca, meno rumore" });
  assert.equal(created.status, "DRAFT");
  assert.equal(created.slug, "piu-ricerca-meno-rumore");
  assert.equal(created.publishedAt, null);
  assert.deepEqual(created.externalLinks, []);
});

test("equal titles get distinct slugs", async () => {
  const a = await createNews({ title: "Stesso titolo" });
  const b = await createNews({ title: "Stesso titolo" });
  assert.equal(a.slug, "stesso-titolo");
  assert.equal(b.slug, "stesso-titolo-2");
});

test("drafts are invisible to the public API", async () => {
  const created = await createNews();

  const list = await request("GET", "/api/public/news");
  assert.equal(list.status, 200);
  assert.equal(list.json.total, 0);

  assert.equal((await request("GET", `/api/public/news/${created.slug}`)).status, 404);
});

test("publishing shows the news, unpublishing hides it again", async () => {
  const created = await createNews();

  const published = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { status: "PUBLISHED" } });
  assert.equal(published.status, 200);
  assert.equal(published.json.status, "PUBLISHED");
  assert.ok(published.json.publishedAt);

  const list = await request("GET", "/api/public/news");
  assert.equal(list.json.total, 1);
  assert.equal(list.json.items[0].slug, created.slug);
  assert.equal(list.json.items[0].body, undefined, "the list carries an excerpt, not the full body");
  assert.equal(list.json.items[0].excerpt, "Primo paragrafo. Secondo paragrafo.");

  const detail = await request("GET", `/api/public/news/${created.slug}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.body, "Primo paragrafo.\n\nSecondo paragrafo.");
  assert.equal(detail.json.status, undefined, "admin-only fields are not exposed");
  assert.equal(detail.json.id, undefined);
  assert.equal(detail.json.createdAt, undefined);

  await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { status: "DRAFT" } });
  assert.equal((await request("GET", `/api/public/news/${created.slug}`)).status, 404);
});

test("the original publication date survives an unpublish and publish cycle", async () => {
  const created = await createNews({ status: "PUBLISHED" });
  const first = created.publishedAt;
  assert.ok(first);

  await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { status: "DRAFT" } });
  const again = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { status: "PUBLISHED" } });
  assert.equal(again.json.publishedAt, first);
});

test("public list filters by category and orders by date, newest first", async () => {
  await createNews({ title: "Vecchia", date: "2026-01-01T00:00:00Z", category: "RICERCA", status: "PUBLISHED" });
  await createNews({ title: "Nuova", date: "2026-06-01T00:00:00Z", category: "MATEIRA", status: "PUBLISHED" });

  const all = await request("GET", "/api/public/news");
  assert.deepEqual(all.json.items.map((n: any) => n.title), ["Nuova", "Vecchia"]);

  const research = await request("GET", "/api/public/news?category=RICERCA");
  assert.equal(research.json.total, 1);
  assert.equal(research.json.items[0].title, "Vecchia");

  assert.equal((await request("GET", "/api/public/news?category=NOPE")).status, 400);
});

test("public list paginates", async () => {
  for (const n of [1, 2, 3]) {
    await createNews({ title: `Notizia ${n}`, date: `2026-0${n}-01T00:00:00Z`, status: "PUBLISHED" });
  }
  const first = await request("GET", "/api/public/news?limit=2&page=1");
  const second = await request("GET", "/api/public/news?limit=2&page=2");

  assert.equal(first.json.total, 3);
  assert.equal(first.json.items.length, 2);
  assert.equal(second.json.items.length, 1);
  assert.equal(second.json.items[0].title, "Notizia 1");
});

test("a huge page number is clamped and answers with an empty page, not a 500", async () => {
  await createNews({ status: "PUBLISHED" });

  const res = await request("GET", "/api/public/news?page=99999999999999999999&limit=50");
  assert.equal(res.status, 200);
  assert.equal(res.json.page, 10000);
  assert.deepEqual(res.json.items, []);
  assert.equal(res.json.total, 1);
});

test("input is validated", async () => {
  const post = (body: unknown) => request("POST", "/api/admin/news", { token, body });

  assert.equal((await post({ ...newsBody(), title: "" })).status, 400);
  assert.equal((await post({ ...newsBody(), category: "NOPE" })).status, 400);
  assert.equal((await post({ ...newsBody(), date: "ieri" })).status, 400);
  assert.equal((await post({ ...newsBody(), body: "" })).status, 400);
  assert.equal((await post({ ...newsBody(), status: "ARCHIVED" })).status, 400);
  assert.equal((await post({ ...newsBody(), externalLinks: [{ label: "x", url: "javascript:alert(1)" }] })).status, 400);
  assert.equal((await post({ ...newsBody(), externalLinks: [{ label: "", url: "https://mateira.org" }] })).status, 400);
  assert.equal((await post({ ...newsBody(), imageId: "6f9619ff-8b86-4d11-b42d-00c04fc964ff" })).status, 400);
  assert.equal((await post({ ...newsBody(), attachmentIds: ["not-a-uuid"] })).status, 400);
});

test("image, attachments and external links come back serialized", async () => {
  const image = await prisma.media.create({
    data: { bucket: "mateira-media", objectKey: "media/2026/a.png", mimeType: "image/png", alt: "Il porto" },
  });
  const pdf = await prisma.media.create({
    data: { bucket: "mateira-media", objectKey: "media/2026/b.pdf", mimeType: "application/pdf" },
  });

  const created = await createNews({
    status: "PUBLISHED",
    imageId: image.id,
    attachmentIds: [pdf.id],
    externalLinks: [{ label: "Il sito", url: "https://example.org/pagina" }],
    author: "Redazione",
  });

  const detail = await request("GET", `/api/public/news/${created.slug}`);
  assert.equal(detail.json.image.alt, "Il porto");
  assert.match(detail.json.image.url, /media\/2026\/a\.png$/);
  assert.equal(detail.json.attachments.length, 1);
  assert.equal(detail.json.attachments[0].mimeType, "application/pdf");
  assert.deepEqual(detail.json.externalLinks, [{ label: "Il sito", url: "https://example.org/pagina" }]);
  assert.equal(detail.json.author, "Redazione");
});

test("patching replaces attachments and can clear the image", async () => {
  const image = await prisma.media.create({
    data: { bucket: "mateira-media", objectKey: "media/2026/c.png", mimeType: "image/png", alt: "Mare" },
  });
  const created = await createNews({ imageId: image.id });
  assert.ok(created.image);

  const patched = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { imageId: null, attachmentIds: [] } });
  assert.equal(patched.status, 200);
  assert.equal(patched.json.image, null);
  assert.deepEqual(patched.json.attachments, []);
});

test("a title change keeps the slug, an explicit slug changes it", async () => {
  const created = await createNews({ title: "Titolo iniziale" });

  const renamed = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { title: "Titolo nuovo" } });
  assert.equal(renamed.json.slug, "titolo-iniziale");

  const reslug = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { slug: "Un Altro Indirizzo" } });
  assert.equal(reslug.json.slug, "un-altro-indirizzo");
});

test("admin list can filter by status and sees drafts", async () => {
  await createNews({ title: "Bozza" });
  await createNews({ title: "Pubblicata", status: "PUBLISHED" });

  const all = await request("GET", "/api/admin/news", { token });
  assert.equal(all.json.total, 2);

  const drafts = await request("GET", "/api/admin/news?status=DRAFT", { token });
  assert.equal(drafts.json.total, 1);
  assert.equal(drafts.json.items[0].title, "Bozza");
  assert.equal(drafts.json.items[0].status, "DRAFT");
});

test("admin can read one news by id, and unknown ids are 404", async () => {
  const created = await createNews();
  const one = await request("GET", `/api/admin/news/${created.id}`, { token });
  assert.equal(one.status, 200);
  assert.equal(one.json.id, created.id);

  assert.equal((await request("GET", "/api/admin/news/6f9619ff-8b86-4d11-b42d-00c04fc964ff", { token })).status, 404);
});

test("delete removes the news everywhere", async () => {
  const created = await createNews({ status: "PUBLISHED" });
  assert.equal((await request("DELETE", `/api/admin/news/${created.id}`, { token })).status, 204);
  assert.equal((await request("DELETE", `/api/admin/news/${created.id}`, { token })).status, 404);
  assert.equal((await request("GET", `/api/public/news/${created.slug}`)).status, 404);
});
