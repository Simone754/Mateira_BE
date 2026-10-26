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

const ORGANS = "/api/admin/organs";
const PUBLIC = "/api/public/organs";
const UNKNOWN_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";
const DUPLICATE = { error: "an organ with this name already exists" };

const organBody = (overrides: Record<string, unknown> = {}) => ({
  name: "Consiglio di amministrazione",
  category: "GOVERNANCE",
  ...overrides,
});

const post = (body: unknown) => request("POST", ORGANS, { token, body });
const patch = (id: string, body: unknown) => request("PATCH", `${ORGANS}/${id}`, { token, body });
const getOne = (id: string) => request("GET", `${ORGANS}/${id}`, { token });

async function createOrgan(overrides: Record<string, unknown> = {}) {
  const res = await post(organBody(overrides));
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function adminOrgans(query = ""): Promise<any[]> {
  const res = await request("GET", `${ORGANS}${query}`, { token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.organs;
}

async function publicOrgans(query = ""): Promise<any[]> {
  const res = await request("GET", `${PUBLIC}${query}`);
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.organs;
}

const names = (organs: any[]) => organs.map((o) => o.name);

test("every admin route needs the admin token and changes nothing without it", async () => {
  const created = await createOrgan();
  const byId = `${ORGANS}/${created.id}`;
  const routes: [string, string, unknown?][] = [
    ["GET", ORGANS],
    ["POST", ORGANS, organBody({ name: "Intruso" })],
    ["GET", byId],
    ["PATCH", byId, { name: "Manomesso" }],
    ["DELETE", byId],
    ["GET", `${ORGANS}/not-a-uuid`],
  ];
  for (const [method, path, body] of routes) {
    const res = await request(method, path, { body });
    assert.equal(res.status, 401, `${method} ${path}`);
    assert.deepEqual(res.json, { error: "Unauthorized" });
  }
  assert.deepEqual(await adminOrgans(), [created]);
});

test("the public route is read-only and has no sub-paths; admin answers are not cached", async () => {
  const created = await createOrgan({ status: "PUBLISHED" });
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await request(method, PUBLIC, { token, body: organBody({ name: "Intruso" }) });
    assert.equal(res.status, 404, method);
  }
  assert.equal((await request("GET", `${PUBLIC}/${created.id}`)).status, 404);
  assert.deepEqual(names(await publicOrgans()), ["Consiglio di amministrazione"]);
  assert.equal((await request("GET", ORGANS, { token })).headers.get("cache-control"), "no-store");
});

test("an organ is created as a draft at the end of its category", async () => {
  const res = await post(organBody());
  assert.equal(res.status, 201, JSON.stringify(res.json));
  const organ = res.json;
  assert.deepEqual(Object.keys(organ).sort(), [
    "category",
    "createdAt",
    "description",
    "id",
    "memberCount",
    "name",
    "position",
    "publishedAt",
    "status",
    "updatedAt",
  ]);
  assert.deepEqual(
    [organ.name, organ.category, organ.description, organ.position, organ.status, organ.publishedAt, organ.memberCount],
    ["Consiglio di amministrazione", "GOVERNANCE", null, 0, "DRAFT", null, 0],
  );
  assert.equal((await createOrgan({ name: "Collegio dei revisori" })).position, 1);
  assert.equal((await createOrgan({ name: "Comitato scientifico", category: "ADVISORY" })).position, 0);
});

test("an organ created as PUBLISHED has its publication date", async () => {
  const organ = await createOrgan({ status: "PUBLISHED", description: "Funzioni." });
  assert.ok(Date.parse(organ.publishedAt) > 0);
  assert.equal(organ.description, "Funzioni.");
});

test("the limits are inclusive and invalid values are 400", async () => {
  assert.equal((await post(organBody({ name: "n".repeat(160) }))).status, 201);
  assert.equal((await post(organBody({ name: "d1", description: "a".repeat(3000) }))).status, 201);
  for (const position of [0, 9999]) assert.equal((await post(organBody({ name: `p${position}`, position }))).status, 201);

  const bad: Record<string, unknown>[] = [
    { name: undefined },
    { name: "   " },
    { name: null },
    { name: "n".repeat(161) },
    { name: "Due\nrighe" },
    { name: "Due\r\nrighe" },
    { category: "OTHER" },
    { category: undefined },
    { description: "a".repeat(3001) },
    { position: -1 },
    { position: 10000 },
    { position: 1.5 },
    { position: "1" },
    { name: "a\u0000b" },
    { description: "a\u0000b" },
    { name: "a\ud800b" },
    { slug: "x" },
    { id: UNKNOWN_ID },
    { memberCount: 3 },
  ];
  for (const overrides of bad) {
    const res = await post(organBody({ name: "Valido", ...overrides }));
    assert.equal(res.status, 400, JSON.stringify(overrides));
    assert.equal(typeof res.json.error, "string");
  }
  assert.equal((await adminOrgans()).length, 4, "nothing else was stored");
});

test("description line ends become \\n and edges are trimmed", async () => {
  const organ = await createOrgan({ description: "  Primo.\r\n\r\nSecondo,\rcon a capo.  " });
  assert.equal(organ.description, "Primo.\n\nSecondo,\ncon a capo.");
  assert.equal((await createOrgan({ name: "Altro", description: "   " })).description, null);
  assert.equal((await createOrgan({ name: "Ancora", description: null })).description, null);
  // measured after the conversion: 3001 as sent, 2001 stored
  const long = await createOrgan({ name: "Lungo", description: "a\r\n".repeat(1000) + "a" });
  assert.equal(long.description.length, 2001);
});

test("the name is unique, also when two creations arrive together", async () => {
  await createOrgan();
  const dup = await post(organBody({ category: "ADVISORY" }));
  assert.deepEqual([dup.status, dup.json], [409, DUPLICATE]);
  assert.equal((await post(organBody({ name: "  Consiglio di amministrazione  " }))).status, 409);

  const results = await Promise.all(Array.from({ length: 5 }, () => post(organBody({ name: "Gara" }))));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 409, 409, 409, 409], JSON.stringify(results.map((r) => r.json)));
});

test("patch changes single fields and refuses an empty or unknown body", async () => {
  const organ = await createOrgan();
  const byName = await patch(organ.id, { name: "Nuovo nome" });
  assert.equal(byName.status, 200, JSON.stringify(byName.json));
  assert.equal(byName.json.name, "Nuovo nome");
  assert.equal((await patch(organ.id, { description: "Funzioni." })).json.description, "Funzioni.");
  assert.equal((await patch(organ.id, { description: null })).json.description, null);
  assert.equal((await patch(organ.id, { position: 7 })).json.position, 7);

  const empty = await patch(organ.id, {});
  assert.equal(empty.status, 400);
  assert.deepEqual(empty.json, { error: "nothing to change" });
  assert.equal((await patch(organ.id, { name: "X", slug: "y" })).status, 400);
  assert.equal((await patch(organ.id, { name: "" })).status, 400);
  assert.equal((await patch(organ.id, { name: "A\nB" })).status, 400);
  assert.equal((await getOne(organ.id)).json.name, "Nuovo nome");
});

test("changing category without a position puts the organ at the end of the new one", async () => {
  const a = await createOrgan({ name: "A" });
  await createOrgan({ name: "B", category: "ADVISORY" });
  await createOrgan({ name: "C", category: "ADVISORY" });
  const moved = await patch(a.id, { category: "ADVISORY" });
  assert.deepEqual([moved.json.category, moved.json.position], ["ADVISORY", 2]);
  const kept = await patch(a.id, { category: "GOVERNANCE", position: 5 });
  assert.deepEqual([kept.json.category, kept.json.position], ["GOVERNANCE", 5]);
  const same = await patch(a.id, { category: "GOVERNANCE" });
  assert.equal(same.json.position, 5, "same category: position kept");
});

test("publishing sets publishedAt once and unpublishing and republishing does not change it", async () => {
  const organ = await createOrgan();
  const first = await patch(organ.id, { status: "PUBLISHED" });
  assert.equal(first.json.status, "PUBLISHED");
  assert.ok(Date.parse(first.json.publishedAt) > 0);
  const draft = await patch(organ.id, { status: "DRAFT" });
  assert.equal(draft.json.publishedAt, first.json.publishedAt);
  await new Promise((r) => setTimeout(r, 15));
  const again = await patch(organ.id, { status: "PUBLISHED" });
  assert.equal(again.json.publishedAt, first.json.publishedAt);
});

test("renaming to a name already used is 409 and changes nothing", async () => {
  await createOrgan({ name: "Uno" });
  const two = await createOrgan({ name: "Due" });
  const res = await patch(two.id, { name: "Uno", description: "Cambiata" });
  assert.deepEqual([res.status, res.json], [409, DUPLICATE]);
  const after = (await getOne(two.id)).json;
  assert.deepEqual([after.name, after.description], ["Due", null]);
  assert.equal((await patch(two.id, { name: "Due" })).status, 200, "its own name is fine");
});

test("the admin list filters by category, orders by position, createdAt, id, and refuses a bad filter", async () => {
  await createOrgan({ name: "B", position: 1 });
  await createOrgan({ name: "A", position: 0 });
  await createOrgan({ name: "C", position: 1 });
  await createOrgan({ name: "Consultivo", category: "ADVISORY" });
  assert.deepEqual(names(await adminOrgans("?category=GOVERNANCE")), ["A", "B", "C"]);
  assert.deepEqual(names(await adminOrgans("?category=ADVISORY")), ["Consultivo"]);
  assert.equal((await adminOrgans()).length, 4);
  assert.deepEqual(names(await adminOrgans("?category=ADVISORY&category=GOVERNANCE")), ["A", "B", "C"], "the last one counts");
  for (const q of ["?category=", "?category=XYZ", "?category=governance"]) {
    const res = await request("GET", `${ORGANS}${q}`, { token });
    assert.equal(res.status, 400, q);
  }

  // same position and same createdAt: id decides
  await prisma.organ.updateMany({ data: { position: 3, createdAt: new Date("2026-01-01T00:00:00Z") } });
  const ids = (await adminOrgans("?category=GOVERNANCE")).map((o) => o.id);
  assert.deepEqual(ids, [...ids].sort());
});

test("get, patch and delete with a bad or unknown id are 404", async () => {
  for (const id of ["not-a-uuid", UNKNOWN_ID]) {
    assert.equal((await getOne(id)).status, 404, id);
    assert.equal((await patch(id, { name: "X" })).status, 404, id);
    assert.equal((await request("DELETE", `${ORGANS}/${id}`, { token })).status, 404, id);
  }
});

test("delete answers 204 once and 404 after; concurrent deletes give one 204", async () => {
  const organ = await createOrgan();
  assert.equal((await request("DELETE", `${ORGANS}/${organ.id}`, { token })).status, 204);
  assert.equal((await request("DELETE", `${ORGANS}/${organ.id}`, { token })).status, 404);
  assert.deepEqual(await adminOrgans(), []);

  const other = await createOrgan({ name: "Altro" });
  const results = await Promise.all(Array.from({ length: 5 }, () => request("DELETE", `${ORGANS}/${other.id}`, { token })));
  assert.deepEqual(results.map((r) => r.status).sort(), [204, 404, 404, 404, 404]);
});

test("a patch racing a delete answers 200 or 404, never 500", async () => {
  for (let i = 0; i < 5; i++) {
    const organ = await createOrgan({ name: `Corsa ${i}` });
    const [patched, deleted] = await Promise.all([
      patch(organ.id, { description: "Cambiata." }),
      request("DELETE", `${ORGANS}/${organ.id}`, { token }),
    ]);
    assert.ok([200, 404].includes(patched.status), `patch answered ${patched.status}: ${JSON.stringify(patched.json)}`);
    assert.equal(deleted.status, 204);
  }
});

test("memberCount counts the ORGAN_MEMBER roles of the organ, drafts included", async () => {
  const organ = await createOrgan();
  const empty = await getOne(organ.id);
  assert.equal(empty.status, 200);
  assert.equal(empty.json.memberCount, 0);

  const draft = await prisma.person.create({ data: { name: "Maria Rossi" } });
  const published = await prisma.person.create({ data: { name: "Luca Bianchi", status: "PUBLISHED" } });
  await prisma.personRole.create({ data: { personId: draft.id, kind: "ORGAN_MEMBER", organId: organ.id, position: 0 } });
  await prisma.personRole.create({ data: { personId: published.id, kind: "ORGAN_MEMBER", organId: organ.id, position: 1 } });
  await prisma.personRole.create({ data: { personId: published.id, kind: "TEAM", position: 0 } });
  assert.equal((await adminOrgans())[0].memberCount, 2, "no other kind, no other organ");
  assert.equal((await getOne(organ.id)).json.memberCount, 2);
});

test("deleting an organ deletes the roles in it and keeps the people", async () => {
  const organ = await createOrgan();
  const person = await prisma.person.create({ data: { name: "Maria Rossi" } });
  await prisma.personRole.create({ data: { personId: person.id, kind: "ORGAN_MEMBER", organId: organ.id, position: 0 } });
  await prisma.personRole.create({ data: { personId: person.id, kind: "TEAM", position: 0 } });
  assert.equal((await request("DELETE", `${ORGANS}/${organ.id}`, { token })).status, 204);
  assert.deepEqual((await prisma.personRole.findMany()).map((r) => r.kind), ["TEAM"]);
  assert.equal(await prisma.person.count(), 1);
});

test("public list: only published, GOVERNANCE first then ADVISORY, each in order, with exactly the public fields", async () => {
  await createOrgan({ name: "Bozza", status: "DRAFT" });
  await createOrgan({ name: "Consultivo 2", category: "ADVISORY", position: 1, status: "PUBLISHED" });
  await createOrgan({ name: "Governo 2", position: 1, status: "PUBLISHED", description: "Funzioni." });
  await createOrgan({ name: "Consultivo 1", category: "ADVISORY", position: 0, status: "PUBLISHED" });
  await createOrgan({ name: "Governo 1", position: 0, status: "PUBLISHED" });

  const all = await publicOrgans();
  assert.deepEqual(names(all), ["Governo 1", "Governo 2", "Consultivo 1", "Consultivo 2"]);
  for (const organ of all) {
    assert.deepEqual(Object.keys(organ).sort(), ["category", "description", "id", "members", "name"]);
    assert.deepEqual(organ.members, []);
  }
  assert.equal(all[1].description, "Funzioni.");
  assert.deepEqual(names(await publicOrgans("?category=ADVISORY")), ["Consultivo 1", "Consultivo 2"]);
  assert.deepEqual(names(await publicOrgans("?category=GOVERNANCE")), ["Governo 1", "Governo 2"]);
  assert.deepEqual(names(await publicOrgans("?category=XYZ&category=ADVISORY")), ["Consultivo 1", "Consultivo 2"]);
  for (const q of ["?category=XYZ", "?category=", "?category=ADVISORY&category=XYZ"]) {
    assert.equal((await request("GET", `${PUBLIC}${q}`)).status, 400, q);
  }
});

test("the migration makes a repeated role without organ a unique violation (NULLS NOT DISTINCT)", async () => {
  const person = await prisma.person.create({ data: { name: "Maria Rossi" } });
  await prisma.personRole.create({ data: { personId: person.id, kind: "TEAM", position: 0 } });
  await assert.rejects(
    prisma.personRole.create({ data: { personId: person.id, kind: "TEAM", position: 1 } }),
    (err: any) => err.code === "P2002",
  );
  // another kind is fine
  await prisma.personRole.create({ data: { personId: person.id, kind: "PROMOTER", position: 0 } });
});
