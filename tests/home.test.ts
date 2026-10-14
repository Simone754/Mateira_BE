import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";

import { prisma } from "../src/plugins/prisma";
import { newObjectKey } from "../src/modules/media/service";
import { closeDb, resetDb, startTestServer, type Requester } from "./helpers/app";
import { loginAsAdmin } from "./helpers/auth";

let request: Requester;
let close: () => Promise<void>;
let port: number;
let token: string;

before(async () => {
  ({ request, close, port } = await startTestServer());
});

after(async () => {
  await close();
  await closeDb();
});

beforeEach(async () => {
  await resetDb();
  ({ token } = await loginAsAdmin(request));
});

const BLOCKS = "/api/admin/home-blocks";
const UNKNOWN_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";

type BlockType = "HERO" | "TICKER" | "CTA" | "FEATURED";

const LINK = { label: "Scopri di più", href: "/come-lavoriamo" };

const heroContent = (overrides: Record<string, unknown> = {}) => ({
  title: "Un'idea di sapere",
  primaryCta: LINK,
  ...overrides,
});
const tickerContent = (overrides: Record<string, unknown> = {}) => ({
  items: [{ text: "Nuovo bando aperto" }],
  ...overrides,
});
const ctaContent = (overrides: Record<string, unknown> = {}) => ({
  title: "Sostieni il progetto",
  cta: { label: "Dona ora", href: "https://example.org/dona" },
  ...overrides,
});
const featuredContent = (overrides: Record<string, unknown> = {}) => ({
  title: "In evidenza",
  items: [{ title: "Una scheda", href: "/news/una-scheda" }],
  ...overrides,
});

const VALID: Record<BlockType, () => Record<string, unknown>> = {
  HERO: heroContent,
  TICKER: tickerContent,
  CTA: ctaContent,
  FEATURED: featuredContent,
};

const post = (body: unknown) => request("POST", BLOCKS, { token, body });
const patch = (id: string, body: unknown) => request("PATCH", `${BLOCKS}/${id}`, { token, body });

async function createBlock(type: BlockType, content: unknown = VALID[type](), extra: Record<string, unknown> = {}) {
  const res = await post({ type, content, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function adminBlocks(): Promise<any[]> {
  const res = await request("GET", BLOCKS, { token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.blocks;
}

async function publicBlocks(): Promise<any[]> {
  const res = await request("GET", "/api/public/home");
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.blocks;
}

async function createMedia(mimeType = "image/png", alt: string | null = "Veduta del porto") {
  return prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey(mimeType), mimeType, size: 1234, alt },
  });
}

const titles = (blocks: any[]) => blocks.map((b) => b.content.title);

/** Replaces a method of the Prisma client or of one of its models and returns the function that puts the original back. */
function swap(target: object, name: string, replacement: (...args: any[]) => unknown): () => void {
  const holder = target as Record<string, unknown>;
  const original = holder[name];
  holder[name] = replacement;
  return () => {
    holder[name] = original;
  };
}

/** Counts the calls of a method of a Prisma model while it keeps working as usual. */
function countCalls(model: object, name: string): { calls: () => number; reset: () => void; restore: () => void } {
  const real = (model as Record<string, any>)[name];
  let calls = 0;
  const restore = swap(model, name, (...args) => {
    calls++;
    return real.apply(model, args);
  });
  return { calls: () => calls, reset: () => void (calls = 0), restore };
}

/**
 * Lets a reorder run its first read of the blocks inside its transaction, then runs `action` (on another connection)
 * before the reorder goes on: the way to make a race between the read and the writes happen on purpose.
 */
function afterReorderRead(action: () => Promise<unknown>): { used: () => number; restore: () => void } {
  const realTransaction = prisma.$transaction.bind(prisma) as (fn: (tx: any) => Promise<unknown>, ...rest: unknown[]) => Promise<unknown>;
  let used = 0;
  const restore = swap(prisma, "$transaction", (fn: (tx: any) => Promise<unknown>, ...rest: unknown[]) =>
    realTransaction(
      (tx: any) =>
        fn(
          new Proxy(tx, {
            get(target, prop) {
              const value = target[prop];
              if (prop !== "homeBlock") return value;
              return new Proxy(value, {
                get(model, method) {
                  const member = model[method];
                  if (method !== "findMany") return member;
                  return async (...args: unknown[]) => {
                    const rows = await member.apply(model, args);
                    used++;
                    await action();
                    return rows;
                  };
                },
              });
            },
          }),
        ),
      ...rest,
    ),
  );
  return { used: () => used, restore };
}

// ---------------------------------------------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------------------------------------------

test("every admin route needs the admin token", async () => {
  const created = await createBlock("CTA", ctaContent({ title: "Protetto" }));
  const byId = `${BLOCKS}/${created.id}`;
  const body = { type: "CTA", content: ctaContent() };

  const routes: [method: string, path: string, body?: unknown][] = [
    ["GET", BLOCKS],
    ["POST", BLOCKS, body],
    ["GET", byId],
    ["PATCH", byId, { status: "PUBLISHED" }],
    ["DELETE", byId],
    ["PUT", `${BLOCKS}/order`, { ids: [created.id] }],
    // Unknown paths are guarded too: nobody learns from the answer which paths exist.
    ["GET", `${BLOCKS}/order`],
    ["GET", `${BLOCKS}/not-a-uuid`],
    ["GET", `${BLOCKS}/${created.id}/deeper`],
    ["PUT", BLOCKS, { ids: [] }],
  ];
  for (const [method, path, payload] of routes) {
    const bare = await request(method, path, { body: payload });
    assert.equal(bare.status, 401, `${method} ${path} without a token`);
    assert.deepEqual(bare.json, { error: "Unauthorized" });

    const garbage = await request(method, path, { body: payload, token: "garbage" });
    assert.equal(garbage.status, 401, `${method} ${path} with a garbage token`);
  }

  const untouched = await request("GET", byId, { token });
  assert.equal(untouched.status, 200, "an unauthenticated delete must not remove the block");
  assert.equal(untouched.json.content.title, "Protetto", "an unauthenticated patch must not change the block");
  assert.equal(untouched.json.status, "DRAFT");
  assert.equal(untouched.headers.get("cache-control"), "no-store");
});

test("the public route is read-only and has no sub-paths", async () => {
  await createBlock("CTA", ctaContent(), { status: "PUBLISHED" });

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await request(method, "/api/public/home", { token, body: { type: "CTA", content: ctaContent() } });
    assert.equal(res.status, 404, method);
  }
  assert.equal((await request("GET", "/api/public/home/extra")).status, 404);
  assert.equal((await request("GET", "/api/public/home-blocks")).status, 404);
  assert.equal((await publicBlocks()).length, 1, "nothing was written through the public route");
});

test("unknown paths under the admin prefix are a 404 for an administrator", async () => {
  assert.equal((await request("GET", `${BLOCKS}/order`, { token })).status, 404);
  assert.equal((await request("GET", `${BLOCKS}/not-a-uuid`, { token })).status, 404);
  assert.equal((await request("PATCH", `${BLOCKS}/not-a-uuid`, { token, body: { status: "PUBLISHED" } })).status, 404);
  assert.equal((await request("DELETE", `${BLOCKS}/not-a-uuid`, { token })).status, 404);
  assert.equal((await request("GET", `${BLOCKS}/${UNKNOWN_ID}/deeper`, { token })).status, 404);
  assert.equal((await request("PUT", BLOCKS, { token, body: { ids: [] } })).status, 404);
  assert.equal((await request("POST", `${BLOCKS}/order`, { token, body: { ids: [] } })).status, 404);
});

// ---------------------------------------------------------------------------------------------------------------
// Creating each type
// ---------------------------------------------------------------------------------------------------------------

test("a HERO block is created as a draft with the optional parts stored as null", async () => {
  const created = await createBlock("HERO", heroContent());

  assert.equal(created.type, "HERO");
  assert.equal(created.status, "DRAFT");
  assert.equal(created.publishedAt, null);
  assert.equal(created.position, 0);
  assert.match(created.id, /^[0-9a-f-]{36}$/);
  assert.ok(created.createdAt && created.updatedAt);
  assert.deepEqual(created.content, {
    title: "Un'idea di sapere",
    text: null,
    primaryCta: { label: "Scopri di più", href: "/come-lavoriamo" },
    secondaryCta: null,
  });
});

test("a HERO block keeps its text and secondary call to action", async () => {
  const created = await createBlock(
    "HERO",
    heroContent({ text: "Ricerca, programmi e viaggi.", secondaryCta: { label: "Leggi le news", href: "https://example.org/news" } }),
  );
  assert.deepEqual(created.content, {
    title: "Un'idea di sapere",
    text: "Ricerca, programmi e viaggi.",
    primaryCta: { label: "Scopri di più", href: "/come-lavoriamo" },
    secondaryCta: { label: "Leggi le news", href: "https://example.org/news" },
  });
});

test("a TICKER block keeps its phrases in order, with or without a link", async () => {
  const created = await createBlock(
    "TICKER",
    tickerContent({
      items: [{ text: "Prima frase" }, { text: "Seconda frase", href: "/news" }, { text: "Terza frase", href: null }],
    }),
  );
  assert.deepEqual(created.content, {
    items: [
      { text: "Prima frase", href: null },
      { text: "Seconda frase", href: "/news" },
      { text: "Terza frase", href: null },
    ],
  });
});

test("a CTA block is created with its call to action", async () => {
  const created = await createBlock("CTA", ctaContent({ text: "Ogni contributo conta." }));
  assert.deepEqual(created.content, {
    title: "Sostieni il progetto",
    text: "Ogni contributo conta.",
    cta: { label: "Dona ora", href: "https://example.org/dona" },
  });

  const minimal = await createBlock("CTA", ctaContent());
  assert.equal(minimal.content.text, null);
});

test("a FEATURED block is created with its cards, and a card without image has image null", async () => {
  const created = await createBlock(
    "FEATURED",
    featuredContent({
      items: [
        { title: "Prima scheda", text: "Descrizione", href: "/news/prima" },
        { title: "Seconda scheda", href: "https://example.org/seconda" },
      ],
    }),
  );
  assert.deepEqual(created.content, {
    title: "In evidenza",
    items: [
      { title: "Prima scheda", text: "Descrizione", href: "/news/prima", image: null },
      { title: "Seconda scheda", text: null, href: "https://example.org/seconda", image: null },
    ],
  });
  assert.equal(JSON.stringify(created).includes("imageId"), false, "imageId is never served: image takes its place");
});

test("the limits of every field are inclusive", async () => {
  const hero = await post({
    type: "HERO",
    content: heroContent({
      title: "t".repeat(200),
      text: "x".repeat(600),
      primaryCta: { label: "l".repeat(60), href: `/${"a".repeat(299)}` },
      secondaryCta: { label: "m".repeat(60), href: "/b" },
    }),
  });
  assert.equal(hero.status, 201, JSON.stringify(hero.json));

  const ticker = await post({
    type: "TICKER",
    content: { items: Array.from({ length: 10 }, (_, n) => ({ text: `${n}`.repeat(160).slice(0, 160) })) },
  });
  assert.equal(ticker.status, 201, JSON.stringify(ticker.json));
  assert.equal(ticker.json.content.items.length, 10);

  const cta = await post({
    type: "CTA",
    content: { title: "t".repeat(200), text: "x".repeat(400), cta: { label: "l".repeat(60), href: "/x" } },
  });
  assert.equal(cta.status, 201, JSON.stringify(cta.json));

  const featured = await post({
    type: "FEATURED",
    content: {
      title: "t".repeat(120),
      items: Array.from({ length: 6 }, () => ({ title: "s".repeat(160), text: "x".repeat(300), href: "/x" })),
    },
  });
  assert.equal(featured.status, 201, JSON.stringify(featured.json));
  assert.equal(featured.json.content.items.length, 6);
});

test("strings are trimmed and an empty or null optional string is stored as null", async () => {
  const hero = await createBlock(
    "HERO",
    heroContent({ title: "  Titolo  ", text: "   ", primaryCta: { label: "  Vai  ", href: "  /x  " }, secondaryCta: null }),
  );
  assert.equal(hero.content.title, "Titolo");
  assert.equal(hero.content.text, null);
  assert.deepEqual(hero.content.primaryCta, { label: "Vai", href: "/x" });
  assert.equal(hero.content.secondaryCta, null);

  const nulls = await createBlock("CTA", ctaContent({ text: null }));
  assert.equal(nulls.content.text, null);

  const ticker = await createBlock("TICKER", tickerContent({ items: [{ text: " frase ", href: "  " }, { text: "altra", href: null }] }));
  assert.deepEqual(ticker.content.items, [
    { text: "frase", href: null },
    { text: "altra", href: null },
  ]);

  const featured = await createBlock(
    "FEATURED",
    featuredContent({ items: [{ title: " Scheda ", text: "", href: "/x", imageId: "" }, { title: "Altra", text: null, href: "/y", imageId: null }] }),
  );
  assert.deepEqual(featured.content.items, [
    { title: "Scheda", text: null, href: "/x", image: null },
    { title: "Altra", text: null, href: "/y", image: null },
  ]);
});

// ---------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------

const cta = LINK;
const longText = (n: number) => "x".repeat(n);

// [what is wrong, block type, content, the error must match]
const INVALID: [string, BlockType, unknown, RegExp][] = [
  // HERO
  ["hero without title", "HERO", { primaryCta: cta }, /^content\.title is required/],
  ["hero blank title", "HERO", heroContent({ title: "   " }), /^content\.title is required/],
  ["hero numeric title", "HERO", heroContent({ title: 5 }), /^content\.title is required/],
  ["hero title over 200", "HERO", heroContent({ title: longText(201) }), /^content\.title is too long \(max 200\)/],
  ["hero text over 600", "HERO", heroContent({ text: longText(601) }), /^content\.text is too long \(max 600\)/],
  ["hero numeric text", "HERO", heroContent({ text: 5 }), /^content\.text must be a string/],
  ["hero without primaryCta", "HERO", { title: "T" }, /^content\.primaryCta is required/],
  ["hero null primaryCta", "HERO", heroContent({ primaryCta: null }), /^content\.primaryCta is required/],
  ["hero string primaryCta", "HERO", heroContent({ primaryCta: "/x" }), /^content\.primaryCta must be an object/],
  ["hero array primaryCta", "HERO", heroContent({ primaryCta: [cta] }), /^content\.primaryCta must be an object/],
  ["hero cta without label", "HERO", heroContent({ primaryCta: { href: "/x" } }), /^content\.primaryCta\.label is required/],
  ["hero cta blank label", "HERO", heroContent({ primaryCta: { label: " ", href: "/x" } }), /^content\.primaryCta\.label is required/],
  [
    "hero cta label over 60",
    "HERO",
    heroContent({ primaryCta: { label: longText(61), href: "/x" } }),
    /^content\.primaryCta\.label is too long \(max 60\)/,
  ],
  ["hero cta without href", "HERO", heroContent({ primaryCta: { label: "Vai" } }), /^content\.primaryCta\.href is required/],
  [
    "hero cta javascript href",
    "HERO",
    heroContent({ primaryCta: { label: "Vai", href: "javascript:alert(1)" } }),
    /^content\.primaryCta\.href /,
  ],
  [
    "hero secondary cta without href",
    "HERO",
    heroContent({ secondaryCta: { label: "Vai" } }),
    /^content\.secondaryCta\.href is required/,
  ],
  ["hero secondary cta not an object", "HERO", heroContent({ secondaryCta: "x" }), /^content\.secondaryCta must be an object/],
  ["hero unknown key", "HERO", heroContent({ subtitle: "x" }), /^content\.subtitle is not allowed/],
  ["hero field of another type", "HERO", heroContent({ cta }), /^content\.cta is not allowed/],
  ["hero cta unknown key", "HERO", heroContent({ primaryCta: { ...cta, target: "_blank" } }), /^content\.primaryCta\.target is not allowed/],

  // TICKER
  ["ticker without items", "TICKER", {}, /^content\.items must be a list of 1 to 10 items/],
  ["ticker empty items", "TICKER", { items: [] }, /^content\.items must be a list of 1 to 10 items/],
  [
    "ticker with 11 items",
    "TICKER",
    { items: Array.from({ length: 11 }, (_, n) => ({ text: `frase ${n}` })) },
    /^content\.items must be a list of 1 to 10 items/,
  ],
  ["ticker items not a list", "TICKER", { items: "frase" }, /^content\.items must be a list of 1 to 10 items/],
  ["ticker items an object", "TICKER", { items: { text: "frase" } }, /^content\.items must be a list of 1 to 10 items/],
  ["ticker item not an object", "TICKER", { items: ["frase"] }, /^content\.items\[0\] must be an object/],
  ["ticker item null", "TICKER", { items: [{ text: "ok" }, null] }, /^content\.items\[1\] must be an object/],
  ["ticker item without text", "TICKER", { items: [{ href: "/x" }] }, /^content\.items\[0\]\.text is required/],
  ["ticker item blank text", "TICKER", { items: [{ text: "  " }] }, /^content\.items\[0\]\.text is required/],
  ["ticker item text over 160", "TICKER", { items: [{ text: longText(161) }] }, /^content\.items\[0\]\.text is too long \(max 160\)/],
  [
    "ticker item protocol-relative href",
    "TICKER",
    { items: [{ text: "a" }, { text: "b", href: "//evil.example" }] },
    /^content\.items\[1\]\.href /,
  ],
  ["ticker item numeric href", "TICKER", { items: [{ text: "a", href: 5 }] }, /^content\.items\[0\]\.href must be a string/],
  ["ticker item unknown key", "TICKER", { items: [{ text: "a", title: "x" }] }, /^content\.items\[0\]\.title is not allowed/],
  ["ticker unknown key", "TICKER", tickerContent({ title: "x" }), /^content\.title is not allowed/],

  // CTA
  ["cta without title", "CTA", { cta }, /^content\.title is required/],
  ["cta title over 200", "CTA", ctaContent({ title: longText(201) }), /^content\.title is too long \(max 200\)/],
  ["cta text over 400", "CTA", ctaContent({ text: longText(401) }), /^content\.text is too long \(max 400\)/],
  ["cta without cta", "CTA", { title: "T" }, /^content\.cta is required/],
  ["cta href with a space", "CTA", ctaContent({ cta: { label: "Vai", href: "/a b" } }), /^content\.cta\.href /],
  ["cta label over 60", "CTA", ctaContent({ cta: { label: longText(61), href: "/x" } }), /^content\.cta\.label is too long \(max 60\)/],
  ["cta field of another type", "CTA", ctaContent({ primaryCta: cta }), /^content\.primaryCta is not allowed/],
  ["cta unknown key", "CTA", ctaContent({ color: "red" }), /^content\.color is not allowed/],

  // FEATURED
  ["featured without title", "FEATURED", { items: featuredContent().items }, /^content\.title is required/],
  ["featured title over 120", "FEATURED", featuredContent({ title: longText(121) }), /^content\.title is too long \(max 120\)/],
  ["featured without items", "FEATURED", { title: "T" }, /^content\.items must be a list of 1 to 6 items/],
  ["featured empty items", "FEATURED", featuredContent({ items: [] }), /^content\.items must be a list of 1 to 6 items/],
  [
    "featured with 7 items",
    "FEATURED",
    featuredContent({ items: Array.from({ length: 7 }, (_, n) => ({ title: `scheda ${n}`, href: "/x" })) }),
    /^content\.items must be a list of 1 to 6 items/,
  ],
  ["featured item without title", "FEATURED", featuredContent({ items: [{ href: "/x" }] }), /^content\.items\[0\]\.title is required/],
  [
    "featured item title over 160",
    "FEATURED",
    featuredContent({ items: [{ title: longText(161), href: "/x" }] }),
    /^content\.items\[0\]\.title is too long \(max 160\)/,
  ],
  [
    "featured item text over 300",
    "FEATURED",
    featuredContent({ items: [{ title: "T", text: longText(301), href: "/x" }] }),
    /^content\.items\[0\]\.text is too long \(max 300\)/,
  ],
  ["featured item without href", "FEATURED", featuredContent({ items: [{ title: "T" }] }), /^content\.items\[0\]\.href is required/],
  [
    "featured item mailto href",
    "FEATURED",
    featuredContent({ items: [{ title: "T", href: "mailto:a@b.c" }] }),
    /^content\.items\[0\]\.href /,
  ],
  [
    "featured item imageId not a uuid",
    "FEATURED",
    featuredContent({ items: [{ title: "T", href: "/x", imageId: "abc" }] }),
    /^content\.items\[0\]\.imageId must be a uuid/,
  ],
  [
    "featured item numeric imageId",
    "FEATURED",
    featuredContent({ items: [{ title: "T", href: "/x", imageId: 5 }] }),
    /^content\.items\[0\]\.imageId must be a uuid/,
  ],
  [
    "featured item sends image instead of imageId",
    "FEATURED",
    featuredContent({ items: [{ title: "T", href: "/x", image: { id: UNKNOWN_ID } }] }),
    /^content\.items\[0\]\.image is not allowed/,
  ],
  ["featured unknown key", "FEATURED", featuredContent({ text: "x" }), /^content\.text is not allowed/],
];

test("every invalid content is a 400 that names the field, and nothing is stored", async () => {
  for (const [name, type, content, message] of INVALID) {
    const res = await post({ type, content });
    assert.equal(res.status, 400, `${name}: ${res.status} ${JSON.stringify(res.json)}`);
    assert.match(res.json.error, message, name);
  }
  assert.deepEqual(await adminBlocks(), []);
});

test("href rules: internal paths and http(s) addresses are accepted, everything else is rejected", async () => {
  const accepted: [string, string][] = [
    ["/x", "/x"],
    ["/news/titolo", "/news/titolo"],
    ["https://a.b/c", "https://a.b/c"],
    ["http://a.b", "http://a.b/"],
    ["HTTPS://Example.ORG/Pagina", "https://example.org/Pagina"],
  ];
  for (const [input, stored] of accepted) {
    const res = await post({ type: "CTA", content: ctaContent({ cta: { label: "Vai", href: input } }) });
    assert.equal(res.status, 201, `${input}: ${JSON.stringify(res.json)}`);
    assert.equal(res.json.content.cta.href, stored, input);
  }

  const rejected = [
    "//x",
    "//evil.example/path",
    "javascript:alert(1)",
    "data:text/html,x",
    "mailto:a@b.c",
    "ftp://a.b/c",
    "/a b",
    "https://a.b/c d",
    "/\\evil.example",
    "x",
    "www.example.org",
    "",
    `/${"a".repeat(300)}`,
  ];
  for (const href of rejected) {
    const res = await post({ type: "CTA", content: ctaContent({ cta: { label: "Vai", href } }) });
    assert.equal(res.status, 400, `${JSON.stringify(href)}: ${res.status}`);
    assert.match(res.json.error, /^content\.cta\.href /, href);
  }
  assert.equal((await adminBlocks()).length, accepted.length, "rejected links stored nothing");
});

test("the same href rules apply to the ticker and to the cards", async () => {
  const ok = await post({ type: "TICKER", content: { items: [{ text: "a", href: "https://a.b/c" }, { text: "b", href: "/x" }] } });
  assert.equal(ok.status, 201);

  for (const href of ["//x", "javascript:alert(1)", "mailto:a@b.c", "/a b", `/${"a".repeat(300)}`]) {
    const ticker = await post({ type: "TICKER", content: { items: [{ text: "a", href }] } });
    assert.equal(ticker.status, 400, `ticker ${href}`);
    const card = await post({ type: "FEATURED", content: featuredContent({ items: [{ title: "T", href }] }) });
    assert.equal(card.status, 400, `card ${href}`);
    const hero = await post({ type: "HERO", content: heroContent({ secondaryCta: { label: "Vai", href } }) });
    assert.equal(hero.status, 400, `hero ${href}`);
  }
});

test("keys that exist on every object are unknown keys, never data", async () => {
  // JSON.parse creates a real "__proto__" key, which an object literal would not.
  const withProto = JSON.parse('{"title":"T","primaryCta":{"label":"Vai","href":"/x"},"__proto__":{"title":"x"}}');
  const res = await post({ type: "HERO", content: withProto });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.match(res.json.error, /^content\.__proto__ is not allowed/);

  const nested = JSON.parse('{"title":"T","primaryCta":{"label":"Vai","href":"/x","constructor":{"x":1}}}');
  const res2 = await post({ type: "HERO", content: nested });
  assert.equal(res2.status, 400);
  assert.match(res2.json.error, /^content\.primaryCta\.constructor is not allowed/);

  for (const key of ["constructor", "toString", "hasOwnProperty", "valueOf"]) {
    const res3 = await post({ type: "CTA", content: ctaContent({ [key]: "x" }) });
    assert.equal(res3.status, 400, key);
    assert.match(res3.json.error, new RegExp(`^content\\.${key} is not allowed`), key);
  }

  // A type is looked up in the list of types, not in an object: these names are not types.
  for (const type of ["constructor", "__proto__", "toString", "hero", "Hero", "HERO ", "", null, 5, ["HERO"], { x: 1 }, undefined]) {
    const res4 = await post({ type, content: heroContent() });
    assert.equal(res4.status, 400, JSON.stringify(type));
    assert.match(res4.json.error, /^type must be one of: HERO, TICKER, CTA, FEATURED/);
  }
  assert.deepEqual(await adminBlocks(), []);
});

test("the request body itself is validated", async () => {
  const bad = async (body: unknown, message: RegExp) => {
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, message, JSON.stringify(body));
  };

  await bad(null, /body must be a JSON object/);
  await bad([], /body must be a JSON object/);
  await bad("x", /body must be a JSON object/);
  await bad({ type: "CTA" }, /^content is required/);
  await bad({ type: "CTA", content: null }, /^content must be an object/);
  await bad({ type: "CTA", content: [] }, /^content must be an object/);
  await bad({ type: "CTA", content: "x" }, /^content must be an object/);
  await bad({ type: "CTA", content: ctaContent(), status: "ARCHIVED" }, /^status must be one of/);
  await bad({ type: "CTA", content: ctaContent(), status: "published" }, /^status must be one of/);
  await bad({ type: "CTA", content: ctaContent(), status: null }, /^status must be one of/);
  // The server decides these: a client cannot send them.
  await bad({ type: "CTA", content: ctaContent(), position: 3 }, /^position is not allowed/);
  await bad({ type: "CTA", content: ctaContent(), id: UNKNOWN_ID }, /^id is not allowed/);
  await bad({ type: "CTA", content: ctaContent(), publishedAt: "2026-01-01T00:00:00Z" }, /^publishedAt is not allowed/);

  const empty = await request("POST", BLOCKS, { token });
  assert.equal(empty.status, 400, "no body at all");
  const malformed = await fetch(`http://127.0.0.1:${port}${BLOCKS}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: "{not json",
  });
  assert.equal(malformed.status, 400, "malformed JSON");
  assert.deepEqual(await malformed.json(), { error: "invalid json" });

  assert.deepEqual(await adminBlocks(), []);
});

// ---------------------------------------------------------------------------------------------------------------
// Draft and published
// ---------------------------------------------------------------------------------------------------------------

test("an empty Home answers an empty list", async () => {
  assert.deepEqual((await request("GET", "/api/public/home")).json, { blocks: [] });
  assert.deepEqual((await request("GET", BLOCKS, { token })).json, { blocks: [] });
});

test("drafts never reach the public API, even next to published blocks of the same type", async () => {
  await createBlock("HERO", heroContent({ title: "Hero bozza" }));
  await createBlock("HERO", heroContent({ title: "Hero pubblicata" }), { status: "PUBLISHED" });
  await createBlock("TICKER", tickerContent({ items: [{ text: "Ticker bozza" }] }));
  await createBlock("TICKER", tickerContent({ items: [{ text: "Ticker pubblicato" }] }), { status: "PUBLISHED" });
  await createBlock("CTA", ctaContent({ title: "Cta bozza" }), { status: "DRAFT" });
  await createBlock("FEATURED", featuredContent({ title: "Featured bozza" }));
  await createBlock("FEATURED", featuredContent({ title: "Featured pubblicata" }), { status: "PUBLISHED" });

  const served = await publicBlocks();
  assert.equal(served.length, 3);
  assert.deepEqual(
    served.map((b) => b.type),
    ["HERO", "TICKER", "FEATURED"],
  );
  assert.equal(served[0].content.title, "Hero pubblicata");
  assert.equal(served[1].content.items[0].text, "Ticker pubblicato");
  assert.equal(served[2].content.title, "Featured pubblicata");
  assert.ok(!JSON.stringify(served).includes("bozza"), "no draft text in the public answer");

  assert.equal((await adminBlocks()).length, 7, "the administrator sees everything");
});

test("the public answer carries only id, type and content", async () => {
  const media = await createMedia();
  await createBlock("HERO", heroContent(), { status: "PUBLISHED" });
  await createBlock("TICKER", tickerContent(), { status: "PUBLISHED" });
  await createBlock("CTA", ctaContent(), { status: "PUBLISHED" });
  await createBlock("FEATURED", featuredContent({ items: [{ title: "T", href: "/x", imageId: media.id }] }), { status: "PUBLISHED" });

  const res = await request("GET", "/api/public/home");
  assert.deepEqual(Object.keys(res.json), ["blocks"]);
  assert.equal(res.json.blocks.length, 4);
  for (const block of res.json.blocks) {
    assert.deepEqual(Object.keys(block).sort(), ["content", "id", "type"], block.type);
  }
  const text = JSON.stringify(res.json);
  for (const leaked of ["status", "position", "publishedAt", "createdAt", "updatedAt", "imageId", "DRAFT", "PUBLISHED"]) {
    assert.ok(!text.includes(leaked), `the public answer leaks ${leaked}`);
  }
});

test("publishing shows the block, unpublishing hides it again, the content stays", async () => {
  const created = await createBlock("CTA", ctaContent({ title: "Visibile a richiesta" }));
  assert.deepEqual(await publicBlocks(), []);

  const published = await patch(created.id, { status: "PUBLISHED" });
  assert.equal(published.status, 200, JSON.stringify(published.json));
  assert.equal(published.json.status, "PUBLISHED");
  assert.ok(published.json.publishedAt);
  assert.equal(published.json.content.title, "Visibile a richiesta");
  assert.deepEqual((await publicBlocks()).map((b) => b.id), [created.id]);

  const hidden = await patch(created.id, { status: "DRAFT" });
  assert.equal(hidden.status, 200);
  assert.equal(hidden.json.status, "DRAFT");
  assert.deepEqual(await publicBlocks(), []);
  assert.equal(hidden.json.content.title, "Visibile a richiesta");
});

test("a block created as PUBLISHED is public at once and has its publication date", async () => {
  const created = await createBlock("HERO", heroContent(), { status: "PUBLISHED" });
  assert.equal(created.status, "PUBLISHED");
  assert.ok(created.publishedAt);
  assert.equal((await publicBlocks()).length, 1);
});

test("the first publication date survives an unpublish and publish cycle", async () => {
  const created = await createBlock("HERO", heroContent(), { status: "PUBLISHED" });
  const first = created.publishedAt;
  assert.ok(first);

  await patch(created.id, { status: "DRAFT" });
  const draft = await request("GET", `${BLOCKS}/${created.id}`, { token });
  assert.equal(draft.json.publishedAt, first, "unpublishing keeps the date");

  await new Promise((resolve) => setTimeout(resolve, 15));
  const again = await patch(created.id, { status: "PUBLISHED" });
  assert.equal(again.json.publishedAt, first);

  const draftFirst = await createBlock("CTA");
  assert.equal(draftFirst.publishedAt, null);
  const published = await patch(draftFirst.id, { status: "PUBLISHED" });
  assert.ok(published.json.publishedAt);
  await patch(draftFirst.id, { status: "DRAFT" });
  await new Promise((resolve) => setTimeout(resolve, 15));
  const republished = await patch(draftFirst.id, { status: "PUBLISHED" });
  assert.equal(republished.json.publishedAt, published.json.publishedAt);
});

// ---------------------------------------------------------------------------------------------------------------
// Admin reading
// ---------------------------------------------------------------------------------------------------------------

test("the admin list and the admin detail carry every administrative field", async () => {
  const created = await createBlock("TICKER", tickerContent());
  const list = await adminBlocks();
  assert.equal(list.length, 1);
  assert.deepEqual(Object.keys(list[0]).sort(), ["content", "createdAt", "id", "position", "publishedAt", "status", "type", "updatedAt"]);

  const one = await request("GET", `${BLOCKS}/${created.id}`, { token });
  assert.equal(one.status, 200);
  assert.deepEqual(one.json, list[0]);
  assert.equal(one.json.id, created.id);
});

test("unknown and malformed ids are 404", async () => {
  assert.deepEqual((await request("GET", `${BLOCKS}/${UNKNOWN_ID}`, { token })).json, { error: "Not found" });
  assert.equal((await request("GET", `${BLOCKS}/${UNKNOWN_ID}`, { token })).status, 404);
  assert.equal((await patch(UNKNOWN_ID, { status: "PUBLISHED" })).status, 404);
  assert.equal((await patch(UNKNOWN_ID, { nonsense: true })).status, 404, "the lookup comes before the body is judged");
  assert.equal((await request("DELETE", `${BLOCKS}/${UNKNOWN_ID}`, { token })).status, 404);
  assert.equal((await request("GET", `${BLOCKS}/not-a-uuid`, { token })).status, 404);
});

// ---------------------------------------------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------------------------------------------

test("a new block goes last, and the list and the public answer follow the position", async () => {
  const a = await createBlock("HERO", heroContent({ title: "A" }), { status: "PUBLISHED" });
  const b = await createBlock("CTA", ctaContent({ title: "B" }), { status: "PUBLISHED" });
  const c = await createBlock("CTA", ctaContent({ title: "C" }));
  const d = await createBlock("CTA", ctaContent({ title: "D" }), { status: "PUBLISHED" });

  assert.deepEqual([a, b, c, d].map((block) => block.position), [0, 1, 2, 3]);
  assert.deepEqual(titles(await adminBlocks()), ["A", "B", "C", "D"]);
  assert.deepEqual(titles(await publicBlocks()), ["A", "B", "D"]);
});

test("after deletes the order holds and a new block still goes last", async () => {
  const a = await createBlock("CTA", ctaContent({ title: "A" }), { status: "PUBLISHED" });
  const b = await createBlock("CTA", ctaContent({ title: "B" }), { status: "PUBLISHED" });
  const c = await createBlock("CTA", ctaContent({ title: "C" }), { status: "PUBLISHED" });

  assert.equal((await request("DELETE", `${BLOCKS}/${b.id}`, { token })).status, 204);
  assert.deepEqual(titles(await adminBlocks()), ["A", "C"]);
  assert.deepEqual(titles(await publicBlocks()), ["A", "C"]);

  const d = await createBlock("CTA", ctaContent({ title: "D" }), { status: "PUBLISHED" });
  assert.ok(d.position > c.position, "a new block is after the last one even when positions have gaps");
  assert.deepEqual(titles(await adminBlocks()), ["A", "C", "D"]);

  assert.equal((await request("DELETE", `${BLOCKS}/${a.id}`, { token })).status, 204);
  assert.equal((await request("DELETE", `${BLOCKS}/${d.id}`, { token })).status, 204);
  assert.deepEqual(titles(await adminBlocks()), ["C"]);

  const e = await createBlock("CTA", ctaContent({ title: "E" }));
  assert.deepEqual(titles(await adminBlocks()), ["C", "E"]);
  assert.ok(e.position > c.position);

  assert.equal((await request("DELETE", `${BLOCKS}/${c.id}`, { token })).status, 204);
  assert.equal((await request("DELETE", `${BLOCKS}/${e.id}`, { token })).status, 204);
  assert.deepEqual(await adminBlocks(), []);
  assert.equal((await createBlock("CTA")).position, 0, "the first block of an empty Home is at position 0");
});

test("blocks with the same position are read by creation date and then by id", async () => {
  const content = ctaContent();
  const early = new Date("2026-01-01T00:00:00Z");
  const late = new Date("2026-02-01T00:00:00Z");
  // Largest id but oldest, then two created at the very same instant (the smaller id comes first).
  const x = "ffffffff-ffff-4fff-8fff-ffffffffffff";
  const y = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const z = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  for (const [id, createdAt] of [[y, late], [x, early], [z, late]] as [string, Date][]) {
    await prisma.homeBlock.create({ data: { id, type: "CTA", position: 0, content, status: "PUBLISHED", createdAt } });
  }

  const expected = [x, z, y];
  assert.deepEqual((await adminBlocks()).map((b) => b.id), expected);
  assert.deepEqual((await publicBlocks()).map((b) => b.id), expected);
  assert.deepEqual((await publicBlocks()).map((b) => b.id), expected, "the same order every time");
});

test("reordering rewrites the positions as 0, 1, 2... and the readers follow", async () => {
  const a = await createBlock("CTA", ctaContent({ title: "A" }), { status: "PUBLISHED" });
  const b = await createBlock("CTA", ctaContent({ title: "B" }));
  const c = await createBlock("CTA", ctaContent({ title: "C" }), { status: "PUBLISHED" });
  await request("DELETE", `${BLOCKS}/${b.id}`, { token }); // leaves a gap: positions 0 and 2
  const d = await createBlock("CTA", ctaContent({ title: "D" }));

  const res = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [d.id, c.id, a.id] } });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(Object.keys(res.json), ["blocks"]);
  assert.deepEqual(titles(res.json.blocks), ["D", "C", "A"]);
  assert.deepEqual(res.json.blocks.map((block: any) => block.position), [0, 1, 2]);
  assert.deepEqual(Object.keys(res.json.blocks[0]).sort(), ["content", "createdAt", "id", "position", "publishedAt", "status", "type", "updatedAt"]);

  assert.deepEqual(titles(await adminBlocks()), ["D", "C", "A"]);
  assert.deepEqual(titles(await publicBlocks()), ["C", "A"], "drafts stay hidden, the others follow the new order");

  const next = await createBlock("CTA", ctaContent({ title: "E" }));
  assert.equal(next.position, 3, "a block created after a reorder goes last");
});

test("reordering changes nothing but the positions", async () => {
  const a = await createBlock("HERO", heroContent({ title: "A" }), { status: "PUBLISHED" });
  const b = await createBlock("CTA", ctaContent({ title: "B" }));
  const before = await adminBlocks();

  const res = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [b.id, a.id] } });
  assert.equal(res.status, 200);
  const after = new Map(res.json.blocks.map((block: any) => [block.id, block]));
  for (const old of before) {
    const now: any = after.get(old.id);
    assert.deepEqual(now.content, old.content);
    assert.equal(now.status, old.status);
    assert.equal(now.type, old.type);
    assert.equal(now.publishedAt, old.publishedAt);
    assert.equal(now.createdAt, old.createdAt);
  }
});

test("reordering the same order again, or an empty Home, is fine", async () => {
  assert.deepEqual((await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [] } })).json, { blocks: [] });

  const a = await createBlock("CTA", ctaContent({ title: "A" }));
  const b = await createBlock("CTA", ctaContent({ title: "B" }));
  const res = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [a.id, b.id] } });
  assert.equal(res.status, 200);
  assert.deepEqual(titles(res.json.blocks), ["A", "B"]);
  const again = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [a.id, b.id] } });
  assert.equal(again.status, 200);
});

test("reordering rejects a list with a missing, an extra, a duplicated or a malformed id, and changes nothing", async () => {
  const a = await createBlock("CTA", ctaContent({ title: "A" }));
  const b = await createBlock("CTA", ctaContent({ title: "B" }));
  const c = await createBlock("CTA", ctaContent({ title: "C" }));
  const put = (body: unknown) => request("PUT", `${BLOCKS}/order`, { token, body });

  const cases: [string, unknown, RegExp][] = [
    ["a missing id", { ids: [c.id, a.id] }, /^ids must list every existing block exactly once/],
    ["no ids at all", { ids: [] }, /^ids must list every existing block exactly once/],
    ["an unknown id", { ids: [c.id, b.id, a.id, UNKNOWN_ID] }, /^ids must list every existing block exactly once/],
    ["an unknown id in place of a real one", { ids: [c.id, b.id, UNKNOWN_ID] }, /^ids must list every existing block exactly once/],
    ["a duplicated id", { ids: [c.id, a.id, a.id] }, /^ids must not contain duplicates/],
    ["every id twice", { ids: [a.id, b.id, c.id, a.id, b.id, c.id] }, /^ids must not contain duplicates/],
    ["a malformed id", { ids: [c.id, b.id, "not-a-uuid"] }, /^ids must be a list of uuids/],
    ["a numeric id", { ids: [c.id, b.id, 3] }, /^ids must be a list of uuids/],
    ["ids as a string", { ids: a.id }, /^ids must be a list of uuids/],
    ["ids as an object", { ids: { 0: a.id } }, /^ids must be a list of uuids/],
    ["ids null", { ids: null }, /^ids must be a list of uuids/],
    ["no ids key", {}, /^ids must be a list of uuids/],
    ["another key", { ids: [a.id, b.id, c.id], extra: true }, /^extra is not allowed/],
    ["a body that is a list", [a.id, b.id, c.id], /body must be a JSON object/],
  ];
  for (const [name, body, message] of cases) {
    const res = await put(body);
    assert.equal(res.status, 400, `${name}: ${res.status} ${JSON.stringify(res.json)}`);
    assert.match(res.json.error, message, name);
  }

  assert.deepEqual(titles(await adminBlocks()), ["A", "B", "C"], "no failed request changed the order");
});

test("a block deleted while the order is written is a 409 and the order stays as it was", async () => {
  const a = await createBlock("CTA", ctaContent({ title: "A" }));
  const b = await createBlock("CTA", ctaContent({ title: "B" }));
  const c = await createBlock("CTA", ctaContent({ title: "C" }));

  // The reorder reads the blocks inside its transaction: B is deleted right after that read.
  const race = afterReorderRead(() => prisma.homeBlock.deleteMany({ where: { id: b.id } }));
  try {
    const res = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [c.id, b.id, a.id] } });
    assert.equal(res.status, 409, JSON.stringify(res.json));
    assert.match(res.json.error, /deleted/);
    assert.equal(race.used(), 1, "the race was staged");
  } finally {
    race.restore();
  }

  assert.deepEqual(titles(await adminBlocks()), ["A", "C"], "the transaction was rolled back: A before C as before");
  assert.deepEqual((await adminBlocks()).map((block) => block.position), [0, 2], "positions were not rewritten");

  // With the real transaction back, the same request is now a plain 400: B is gone.
  const stale = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [c.id, b.id, a.id] } });
  assert.equal(stale.status, 400);
});

test("a block created while the order is written lands last and is not an error", async () => {
  const a = await createBlock("CTA", ctaContent({ title: "A" }));
  const b = await createBlock("CTA", ctaContent({ title: "B" }));

  const race = afterReorderRead(() =>
    prisma.homeBlock.create({ data: { type: "CTA", position: 2, content: ctaContent({ title: "Nuovo" }) } }),
  );
  try {
    const res = await request("PUT", `${BLOCKS}/order`, { token, body: { ids: [b.id, a.id] } });
    assert.equal(res.status, 200, JSON.stringify(res.json));
    assert.equal(race.used(), 1, "the race was staged");
    assert.deepEqual(titles(res.json.blocks), ["B", "A", "Nuovo"]);
  } finally {
    race.restore();
  }
});

test("reorders racing deletes and creates never answer 500", async () => {
  for (let round = 0; round < 5; round++) {
    await resetDb();
    ({ token } = await loginAsAdmin(request));
    const ids: string[] = [];
    for (const n of [1, 2, 3, 4]) ids.push((await createBlock("CTA", ctaContent({ title: `R${round}-${n}` }))).id);

    const results = await Promise.all([
      request("PUT", `${BLOCKS}/order`, { token, body: { ids: [...ids].reverse() } }),
      request("PUT", `${BLOCKS}/order`, { token, body: { ids } }),
      request("DELETE", `${BLOCKS}/${ids[1]}`, { token }),
      post({ type: "CTA", content: ctaContent({ title: "Nuovo" }) }),
    ]);
    const [reorderA, reorderB, del, create] = results;
    for (const reorder of [reorderA, reorderB]) {
      assert.ok([200, 400, 409].includes(reorder.status), `round ${round}: reorder answered ${reorder.status} ${JSON.stringify(reorder.json)}`);
    }
    assert.equal(del.status, 204, `round ${round}`);
    assert.equal(create.status, 201, `round ${round}`);

    const list = await adminBlocks();
    assert.equal(list.length, 4, "three survivors and the new block");
    assert.equal(new Set(list.map((b) => b.id)).size, 4);
  }
});

// ---------------------------------------------------------------------------------------------------------------
// Updating
// ---------------------------------------------------------------------------------------------------------------

test("a patch replaces the whole content, so parts that are not sent become null", async () => {
  const created = await createBlock(
    "HERO",
    heroContent({ text: "Testo iniziale", secondaryCta: { label: "Altro", href: "/altro" } }),
  );

  const res = await patch(created.id, { content: heroContent({ title: "Titolo nuovo" }) });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  assert.deepEqual(res.json.content, {
    title: "Titolo nuovo",
    text: null,
    primaryCta: { label: "Scopri di più", href: "/come-lavoriamo" },
    secondaryCta: null,
  });
  assert.equal(res.json.id, created.id);
  assert.equal(res.json.type, "HERO");
  assert.equal(res.json.position, created.position);
  assert.equal(res.json.status, "DRAFT");
  assert.deepEqual((await request("GET", `${BLOCKS}/${created.id}`, { token })).json, res.json);
});

test("a patch revalidates the content for the type of the block", async () => {
  const hero = await createBlock("HERO");
  const ticker = await createBlock("TICKER");
  const cta = await createBlock("CTA");
  const featured = await createBlock("FEATURED");

  // Valid content of another type is invalid here: its fields are unknown to this type.
  assert.match((await patch(cta.id, { content: heroContent() })).json.error, /^content\.primaryCta is not allowed/);
  assert.match((await patch(hero.id, { content: ctaContent() })).json.error, /^content\.cta is not allowed/);
  assert.match((await patch(hero.id, { content: tickerContent() })).json.error, /^content\.items is not allowed/);
  assert.match((await patch(ticker.id, { content: featuredContent() })).json.error, /^content\.title is not allowed/);
  assert.match((await patch(featured.id, { content: tickerContent({ title: undefined }) })).json.error, /^content\.title is required/);

  // And the rules of the type apply as on creation.
  assert.equal((await patch(ticker.id, { content: { items: [] } })).status, 400);
  assert.equal((await patch(ticker.id, { content: { items: [{ text: "x".repeat(161) }] } })).status, 400);
  assert.equal((await patch(cta.id, { content: ctaContent({ cta: { label: "Vai", href: "javascript:alert(1)" } }) })).status, 400);
  assert.equal((await patch(cta.id, { content: ctaContent({ extra: 1 }) })).status, 400);
  assert.equal((await patch(featured.id, { content: featuredContent({ items: [] }) })).status, 400);

  const same = await patch(cta.id, { content: ctaContent({ title: "Nuovo titolo" }) });
  assert.equal(same.status, 200);
  assert.equal(same.json.content.title, "Nuovo titolo");

  const stored = await adminBlocks();
  assert.equal(stored.find((b) => b.id === cta.id).content.title, "Nuovo titolo");
  assert.deepEqual(stored.find((b) => b.id === hero.id).content, hero.content, "rejected patches changed nothing");
});

test("the type of a block cannot be changed", async () => {
  const created = await createBlock("CTA");

  for (const body of [{ type: "HERO" }, { type: "CTA" }, { type: "HERO", content: heroContent() }, { type: "CTA", status: "PUBLISHED" }]) {
    const res = await patch(created.id, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match(res.json.error, /^type cannot be changed/, JSON.stringify(body));
  }
  const stored = await request("GET", `${BLOCKS}/${created.id}`, { token });
  assert.equal(stored.json.type, "CTA");
  assert.equal(stored.json.status, "DRAFT", "a patch with a type changes nothing, not even the status");
});

test("a patch can change the status alone, or the content alone, and keeps the position", async () => {
  await createBlock("CTA", ctaContent({ title: "Primo" }));
  const second = await createBlock("CTA", ctaContent({ title: "Secondo" }));

  const statusOnly = await patch(second.id, { status: "PUBLISHED" });
  assert.equal(statusOnly.status, 200);
  assert.equal(statusOnly.json.content.title, "Secondo");
  assert.equal(statusOnly.json.position, 1);

  const contentOnly = await patch(second.id, { content: ctaContent({ title: "Secondo bis" }) });
  assert.equal(contentOnly.status, 200);
  assert.equal(contentOnly.json.status, "PUBLISHED", "the status is untouched");
  assert.ok(contentOnly.json.publishedAt);

  const both = await patch(second.id, { status: "DRAFT", content: ctaContent({ title: "Secondo ter" }) });
  assert.equal(both.json.status, "DRAFT");
  assert.equal(both.json.content.title, "Secondo ter");
  assert.deepEqual(titles(await adminBlocks()), ["Primo", "Secondo ter"]);
});

test("a patch moves updatedAt forward and keeps createdAt", async () => {
  const created = await createBlock("CTA");
  await new Promise((resolve) => setTimeout(resolve, 15));
  const res = await patch(created.id, { content: ctaContent({ title: "Cambiato" }) });
  assert.equal(res.json.createdAt, created.createdAt);
  assert.ok(Date.parse(res.json.updatedAt) > Date.parse(created.updatedAt));
});

test("a patch body is validated: nothing to change, unknown keys and bad values are 400", async () => {
  const created = await createBlock("CTA");

  const cases: [string, unknown, RegExp][] = [
    ["an empty body", {}, /^content or status is required/],
    ["content null", { content: null }, /^content must be an object/],
    ["content a list", { content: [] }, /^content must be an object/],
    ["content a string", { content: "x" }, /^content must be an object/],
    ["an invalid status", { status: "ARCHIVED" }, /^status must be one of/],
    ["a null status", { status: null }, /^status must be one of/],
    ["position", { position: 0 }, /^position is not allowed/],
    ["id", { id: UNKNOWN_ID, status: "PUBLISHED" }, /^id is not allowed/],
    ["publishedAt", { publishedAt: "2026-01-01T00:00:00Z" }, /^publishedAt is not allowed/],
    ["a list as the body", [], /body must be a JSON object/],
  ];
  for (const [name, body, message] of cases) {
    const res = await patch(created.id, body);
    assert.equal(res.status, 400, `${name}: ${res.status} ${JSON.stringify(res.json)}`);
    assert.match(res.json.error, message, name);
  }
  assert.equal((await request("PATCH", `${BLOCKS}/${created.id}`, { token })).status, 400, "no body at all");

  const stored = await request("GET", `${BLOCKS}/${created.id}`, { token });
  assert.deepEqual(stored.json, created, "no failed patch changed the block");
});

// ---------------------------------------------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------------------------------------------

test("a card with an image is served with the resolved image on both sides", async () => {
  const media = await createMedia("image/png", "Il porto al tramonto");
  const created = await createBlock(
    "FEATURED",
    featuredContent({
      items: [
        { title: "Con immagine", href: "/x", imageId: media.id },
        { title: "Senza immagine", href: "/y" },
      ],
    }),
    { status: "PUBLISHED" },
  );

  const expectedImage = { id: media.id, url: `${process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/+$/, "")}/mateira-media/${media.objectKey}`, alt: "Il porto al tramonto" };
  assert.deepEqual(created.content.items[0].image, expectedImage);
  assert.equal(created.content.items[1].image, null);

  const admin = await request("GET", `${BLOCKS}/${created.id}`, { token });
  assert.deepEqual(admin.json.content.items[0].image, expectedImage);
  assert.deepEqual((await adminBlocks())[0].content.items[0].image, expectedImage);

  const served = (await publicBlocks())[0];
  assert.deepEqual(served.content.items[0].image, expectedImage);
  assert.deepEqual(Object.keys(served.content.items[0].image).sort(), ["alt", "id", "url"]);
  assert.deepEqual(Object.keys(served.content.items[0]).sort(), ["href", "image", "text", "title"]);
  assert.match(served.content.items[0].image.url, /\.png$/);
});

test("an image is checked when a card is written: it must exist and be an image", async () => {
  const pdf = await createMedia("application/pdf", null);
  const png = await createMedia("image/png");

  const withPdf = await post({ type: "FEATURED", content: featuredContent({ items: [{ title: "T", href: "/x", imageId: pdf.id }] }) });
  assert.equal(withPdf.status, 400, JSON.stringify(withPdf.json));
  assert.match(withPdf.json.error, /^content\.items\[0\]\.imageId must be an image/);

  const unknown = await post({
    type: "FEATURED",
    content: featuredContent({ items: [{ title: "Ok", href: "/x", imageId: png.id }, { title: "T", href: "/x", imageId: UNKNOWN_ID }] }),
  });
  assert.equal(unknown.status, 400, JSON.stringify(unknown.json));
  assert.match(unknown.json.error, /^content\.items\[1\]\.imageId does not match an existing media/);
  assert.deepEqual(await adminBlocks(), [], "nothing is stored when one image is wrong");

  for (const mimeType of ["image/jpeg", "image/webp"]) {
    const media = await createMedia(mimeType);
    const ok = await post({ type: "FEATURED", content: featuredContent({ items: [{ title: "T", href: "/x", imageId: media.id }] }) });
    assert.equal(ok.status, 201, `${mimeType}: ${JSON.stringify(ok.json)}`);
  }

  // The same checks on update.
  const created = await createBlock("FEATURED");
  const patched = await patch(created.id, { content: featuredContent({ items: [{ title: "T", href: "/x", imageId: pdf.id }] }) });
  assert.equal(patched.status, 400);
  assert.match(patched.json.error, /imageId must be an image/);
  const patchedUnknown = await patch(created.id, { content: featuredContent({ items: [{ title: "T", href: "/x", imageId: UNKNOWN_ID }] }) });
  assert.equal(patchedUnknown.status, 400);
  assert.deepEqual((await request("GET", `${BLOCKS}/${created.id}`, { token })).json.content, created.content);

  const swapped = await patch(created.id, { content: featuredContent({ items: [{ title: "T", href: "/x", imageId: png.id }] }) });
  assert.equal(swapped.status, 200);
  assert.equal(swapped.json.content.items[0].image.id, png.id);
});

test("a media type that only exists as a property name is not an image", async () => {
  const odd = await createMedia("constructor", null);
  const res = await post({ type: "FEATURED", content: featuredContent({ items: [{ title: "T", href: "/x", imageId: odd.id }] }) });
  assert.equal(res.status, 400, JSON.stringify(res.json));
  assert.match(res.json.error, /must be an image/);
});

test("a deleted media gives image null, not an error, on every reader", async () => {
  const media = await createMedia();
  const created = await createBlock(
    "FEATURED",
    featuredContent({ items: [{ title: "T", href: "/x", imageId: media.id }] }),
    { status: "PUBLISHED" },
  );
  assert.equal(created.content.items[0].image.id, media.id);

  await prisma.media.delete({ where: { id: media.id } });

  const one = await request("GET", `${BLOCKS}/${created.id}`, { token });
  assert.equal(one.status, 200);
  assert.equal(one.json.content.items[0].image, null);
  assert.equal((await adminBlocks())[0].content.items[0].image, null);
  const served = await request("GET", "/api/public/home");
  assert.equal(served.status, 200);
  assert.equal(served.json.blocks[0].content.items[0].image, null);
  assert.equal(served.json.blocks[0].content.items[0].title, "T", "the card itself is intact");

  // Saving the block again with the vanished id is refused, saving it without the image works.
  const again = await patch(created.id, { content: featuredContent({ items: [{ title: "T", href: "/x", imageId: media.id }] }) });
  assert.equal(again.status, 400);
  const cleared = await patch(created.id, { content: featuredContent({ items: [{ title: "T", href: "/x" }] }) });
  assert.equal(cleared.status, 200);
});

test("the media of every returned block are fetched with one query, and none when there is no image", async () => {
  const one = await createMedia("image/png", "Uno");
  const two = await createMedia("image/jpeg", "Due");
  await createBlock("FEATURED", featuredContent({ items: [{ title: "A", href: "/a", imageId: one.id }, { title: "B", href: "/b", imageId: two.id }] }), { status: "PUBLISHED" });
  await createBlock("FEATURED", featuredContent({ items: [{ title: "C", href: "/c", imageId: one.id }] }), { status: "PUBLISHED" });
  await createBlock("FEATURED", featuredContent({ items: [{ title: "D", href: "/d", imageId: two.id }, { title: "E", href: "/e" }] }));
  await createBlock("HERO", heroContent(), { status: "PUBLISHED" });

  const spy = countCalls(prisma.media, "findMany");
  try {
    const served = await publicBlocks();
    assert.equal(spy.calls(), 1, "public: one media query for all the blocks");
    assert.equal(served[0].content.items[0].image.alt, "Uno");
    assert.equal(served[0].content.items[1].image.alt, "Due");
    assert.equal(served[1].content.items[0].image.alt, "Uno");

    spy.reset();
    const list = await adminBlocks();
    assert.equal(spy.calls(), 1, "admin list: one media query for all the blocks");
    assert.equal(list[2].content.items[0].image.alt, "Due");
    assert.equal(list[2].content.items[1].image, null);
  } finally {
    spy.restore();
  }

  await resetDb();
  ({ token } = await loginAsAdmin(request));
  await createBlock("HERO", heroContent(), { status: "PUBLISHED" });
  await createBlock("FEATURED", featuredContent(), { status: "PUBLISHED" });
  const quiet = countCalls(prisma.media, "findMany");
  try {
    await publicBlocks();
    await adminBlocks();
    assert.equal(quiet.calls(), 0, "no image to resolve, no media query");
  } finally {
    quiet.restore();
  }
});

test("an uppercase media id is accepted and stored in its usual form", async () => {
  const media = await createMedia();
  const created = await createBlock("FEATURED", featuredContent({ items: [{ title: "T", href: "/x", imageId: ` ${media.id.toUpperCase()} ` }] }));
  assert.equal(created.content.items[0].image.id, media.id);
});

// ---------------------------------------------------------------------------------------------------------------
// Delete and races
// ---------------------------------------------------------------------------------------------------------------

test("delete removes the block everywhere and a second delete is a 404", async () => {
  const created = await createBlock("HERO", heroContent(), { status: "PUBLISHED" });

  const res = await request("DELETE", `${BLOCKS}/${created.id}`, { token });
  assert.equal(res.status, 204);
  assert.equal(res.json, null);
  assert.equal((await request("DELETE", `${BLOCKS}/${created.id}`, { token })).status, 404);
  assert.equal((await request("GET", `${BLOCKS}/${created.id}`, { token })).status, 404);
  assert.deepEqual(await publicBlocks(), []);
  assert.deepEqual(await adminBlocks(), []);
});

test("concurrent creates all succeed and the order is stable", async () => {
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, n) => post({ type: "CTA", content: ctaContent({ title: `Corsa ${n}` }), status: "PUBLISHED" })),
  );

  assert.deepEqual(results.map((r) => r.status), [201, 201, 201, 201, 201], JSON.stringify(results.map((r) => r.json)));
  assert.equal(new Set(results.map((r) => r.json.id)).size, 5);

  const first = (await adminBlocks()).map((b) => b.id);
  assert.equal(first.length, 5);
  assert.deepEqual(new Set(first), new Set(results.map((r) => r.json.id)));
  assert.deepEqual((await adminBlocks()).map((b) => b.id), first, "reading twice gives the same order");
  assert.deepEqual((await publicBlocks()).map((b) => b.id), first, "the public order is the admin order");
});

test("concurrent deletes of the same block answer 204 once and 404 for the others", async () => {
  const created = await createBlock("CTA", ctaContent(), { status: "PUBLISHED" });

  const results = await Promise.all(
    Array.from({ length: 4 }, () => request("DELETE", `${BLOCKS}/${created.id}`, { token })),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [204, 404, 404, 404]);
});

test("a patch racing a delete answers 200 or 404, never 500", async () => {
  for (let round = 0; round < 5; round++) {
    const created = await createBlock("CTA", ctaContent({ title: `Gara ${round}` }));

    const [racingPatch, del] = await Promise.all([
      patch(created.id, { status: "PUBLISHED", content: ctaContent({ title: "Cambiato" }) }),
      request("DELETE", `${BLOCKS}/${created.id}`, { token }),
    ]);

    assert.ok([200, 404].includes(racingPatch.status), `round ${round}: patch answered ${racingPatch.status} ${JSON.stringify(racingPatch.json)}`);
    assert.equal(del.status, 204, `round ${round}: delete answered ${del.status}`);
  }
});

test("a block deleted right after the lookup is a 404 for a patch, not a 500", async () => {
  const created = await createBlock("CTA");
  const stale = await prisma.homeBlock.findUniqueOrThrow({ where: { id: created.id } });
  await prisma.homeBlock.delete({ where: { id: created.id } });

  // The lookup answers as if the row had still been there a moment earlier.
  const delegate = prisma.homeBlock as { findUnique: unknown };
  const originalFindUnique = delegate.findUnique;
  let lookups = 0;
  delegate.findUnique = async () => {
    lookups++;
    return stale;
  };
  try {
    const res = await patch(created.id, { status: "PUBLISHED" });
    assert.equal(res.status, 404, JSON.stringify(res.json));
    assert.deepEqual(res.json, { error: "Not found" });
    assert.equal(lookups, 1, "the stubbed lookup was used");
  } finally {
    delegate.findUnique = originalFindUnique;
  }
});
