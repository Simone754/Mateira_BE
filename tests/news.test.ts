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
  const created = await createNews({ title: "Protetta" });
  const byId = `/api/admin/news/${created.id}`;

  assert.equal((await request("GET", "/api/admin/news")).status, 401);
  assert.equal((await request("POST", "/api/admin/news", { body: newsBody() })).status, 401);
  assert.equal((await request("GET", byId)).status, 401);
  assert.equal((await request("PATCH", byId, { body: { title: "Manomessa" } })).status, 401);
  assert.equal((await request("DELETE", byId)).status, 401);
  assert.equal((await request("GET", "/api/admin/news", { token: "garbage" })).status, 401);

  const untouched = await request("GET", byId, { token });
  assert.equal(untouched.status, 200, "an unauthenticated delete must not remove the news");
  assert.equal(untouched.json.title, "Protetta", "an unauthenticated patch must not change the news");
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
  assert.deepEqual(list.json.items, []);

  assert.equal((await request("GET", `/api/public/news/${created.slug}`)).status, 404);
});

test("a draft never leaks next to a published news of the same category", async () => {
  const draft = await createNews({ title: "Bozza ricerca", category: "RICERCA" });
  const published = await createNews({ title: "Pubblicata ricerca", category: "RICERCA", status: "PUBLISHED" });

  const filtered = await request("GET", "/api/public/news?category=RICERCA");
  assert.equal(filtered.json.total, 1);
  assert.deepEqual(filtered.json.items.map((n: any) => n.slug), [published.slug]);

  const all = await request("GET", "/api/public/news");
  assert.equal(all.json.total, 1);
  assert.deepEqual(all.json.items.map((n: any) => n.slug), [published.slug]);

  assert.equal((await request("GET", `/api/public/news/${draft.slug}`)).status, 404);
  assert.equal((await request("GET", `/api/public/news/${published.slug}`)).status, 200);
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

  const unpublished = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { status: "DRAFT" } });
  assert.equal(unpublished.status, 200);
  assert.equal(unpublished.json.status, "DRAFT");
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

test("a NUL or a lone surrogate in a text is a 400, not a 500", async () => {
  const created = await createNews({ title: "Intatta" });
  for (const bad of ["Titolo\u0000nascosto", "Titolo\ud800rotto"]) {
    const post = await request("POST", "/api/admin/news", { token, body: newsBody({ title: bad }) });
    assert.equal(post.status, 400, JSON.stringify(post.json));
    assert.match(post.json.error, /^title /);

    assert.equal((await request("POST", "/api/admin/news", { token, body: newsBody({ body: bad }) })).status, 400);
    assert.equal((await request("POST", "/api/admin/news", { token, body: newsBody({ author: bad }) })).status, 400);

    const patch = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { title: bad } });
    assert.equal(patch.status, 400, JSON.stringify(patch.json));
  }
  const list = await request("GET", "/api/admin/news", { token });
  assert.equal(list.json.total, 1, "nothing was stored");
  assert.equal(list.json.items[0].title, "Intatta");
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

test("patch and delete on unknown ids are 404", async () => {
  const unknown = "/api/admin/news/6f9619ff-8b86-4d11-b42d-00c04fc964ff";
  assert.equal((await request("PATCH", unknown, { token, body: { title: "x" } })).status, 404);
  assert.equal((await request("DELETE", unknown, { token })).status, 404);
});

test("concurrent creates with the same title all succeed with distinct slugs", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, () => request("POST", "/api/admin/news", { token, body: newsBody({ title: "Corsa" }) })),
  );

  assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201, 201], JSON.stringify(results.map((r) => r.json)));
  const slugs = results.map((r) => r.json.slug as string);
  assert.equal(new Set(slugs).size, 5, slugs.join(", "));
  assert.ok(slugs.every((slug) => slug === "corsa" || /^corsa-\d+$/.test(slug)), slugs.join(", "));
});

test("concurrent patches to the same slug all succeed with distinct slugs", async () => {
  const ids: string[] = [];
  for (const n of [1, 2, 3]) ids.push((await createNews({ title: `Notizia ${n}` })).id);

  const results = await Promise.all(
    ids.map((id) => request("PATCH", `/api/admin/news/${id}`, { token, body: { slug: "indirizzo" } })),
  );

  assert.deepEqual(results.map((r) => r.status), [200, 200, 200], JSON.stringify(results.map((r) => r.json)));
  const slugs = results.map((r) => r.json.slug as string);
  assert.equal(new Set(slugs).size, 3, slugs.join(", "));
  assert.ok(slugs.every((slug) => slug === "indirizzo" || /^indirizzo-\d+$/.test(slug)), slugs.join(", "));
});

test("concurrent deletes of the same news answer 204 once and 404 for the others", async () => {
  const created = await createNews({ status: "PUBLISHED" });

  const results = await Promise.all(
    Array.from({ length: 3 }, () => request("DELETE", `/api/admin/news/${created.id}`, { token })),
  );

  assert.deepEqual(results.map((r) => r.status).sort(), [204, 404, 404]);
});

test("a patch racing a delete answers 200 or 404, never 500", async () => {
  for (let round = 0; round < 5; round++) {
    const created = await createNews({ title: `Gara ${round}` });

    const [patch, del] = await Promise.all([
      request("PATCH", `/api/admin/news/${created.id}`, {
        token,
        body: { title: "Cambiato", slug: `gara-cambiata-${round}`, attachmentIds: [] },
      }),
      request("DELETE", `/api/admin/news/${created.id}`, { token }),
    ]);

    assert.ok([200, 404].includes(patch.status), `round ${round}: patch answered ${patch.status} ${JSON.stringify(patch.json)}`);
    assert.equal(del.status, 204, `round ${round}: delete answered ${del.status}`);
  }
});

test("media that vanishes between the check and the write is a 400, not a 500", async () => {
  const missing = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";
  const created = await createNews({ title: "Con allegato" });

  // The existence check passes, as if the media row had been there a moment earlier.
  const media = prisma.media as { count: unknown };
  const originalCount = media.count;
  let checks = 0;
  media.count = async () => {
    checks++;
    return 1;
  };
  try {
    const post = await request("POST", "/api/admin/news", { token, body: newsBody({ imageId: missing }) });
    assert.equal(post.status, 400, JSON.stringify(post.json));

    const patch = await request("PATCH", `/api/admin/news/${created.id}`, { token, body: { attachmentIds: [missing] } });
    assert.equal(patch.status, 400, JSON.stringify(patch.json));

    assert.equal(checks, 2, "the stubbed existence check must have been used");
  } finally {
    media.count = originalCount;
  }

  assert.equal((await request("GET", "/api/admin/news", { token })).json.total, 1, "the failed create left nothing behind");
  assert.equal((await request("GET", `/api/admin/news/${created.id}`, { token })).status, 200);
});
