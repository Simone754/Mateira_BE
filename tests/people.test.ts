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

const PEOPLE = "/api/admin/people";
const ORGANS = "/api/admin/organs";
const UNKNOWN_ID = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";

const post = (body: unknown) => request("POST", PEOPLE, { token, body });
const patch = (id: string, body: unknown) => request("PATCH", `${PEOPLE}/${id}`, { token, body });
const getOne = (id: string) => request("GET", `${PEOPLE}/${id}`, { token });

async function createPerson(body: Record<string, unknown> = {}) {
  const res = await post({ name: "Anna Rossi", ...body });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function createOrgan(name = "Consiglio di amministrazione") {
  const res = await request("POST", ORGANS, { token, body: { name, category: "GOVERNANCE" } });
  assert.equal(res.status, 201, JSON.stringify(res.json));
  return res.json;
}

async function createMedia(mimeType = "image/png", alt: string | null = "Ritratto") {
  return prisma.media.create({
    data: { bucket: "mateira-media", objectKey: newObjectKey(mimeType), mimeType, size: 1234, alt },
  });
}

async function listPeople(query = ""): Promise<any[]> {
  const res = await request("GET", `${PEOPLE}${query}`, { token });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  return res.json.people;
}

const names = (people: any[]) => people.map((p) => p.name);

test("every admin route needs the admin token", async () => {
  const created = await createPerson();
  const byId = `${PEOPLE}/${created.id}`;
  const routes: [string, string, unknown?][] = [
    ["GET", PEOPLE],
    ["POST", PEOPLE, { name: "Intruso" }],
    ["GET", byId],
    ["PATCH", byId, { name: "Manomesso" }],
    ["DELETE", byId],
  ];
  for (const [method, path, body] of routes) {
    const res = await request(method, path, { body });
    assert.equal(res.status, 401, `${method} ${path}`);
  }
  assert.deepEqual(names(await listPeople()), ["Anna Rossi"]);
  assert.equal((await request("GET", PEOPLE, { token })).headers.get("cache-control"), "no-store");
});

test("a person is created as a draft without roles and photo", async () => {
  const person = await createPerson();
  assert.deepEqual(Object.keys(person).sort(), [
    "bio", "createdAt", "id", "name", "photo", "publishedAt", "roles", "status", "updatedAt",
  ]);
  assert.deepEqual([person.name, person.bio, person.photo, person.status, person.publishedAt, person.roles], [
    "Anna Rossi", null, null, "DRAFT", null, [],
  ]);
  const published = await createPerson({ name: "Bruno", status: "PUBLISHED", bio: "Prima.\r\n\r\nSeconda." });
  assert.ok(Date.parse(published.publishedAt) > 0);
  assert.equal(published.bio, "Prima.\n\nSeconda.");
});

test("roles come with the organ name and go to the end of their list", async () => {
  const organ = await createOrgan();
  const first = await createPerson({
    roles: [{ kind: "PROMOTER" }, { kind: "ORGAN_MEMBER", organId: organ.id, title: "Presidente" }],
  });
  assert.equal(first.roles.length, 2);
  const promoter = first.roles.find((r: any) => r.kind === "PROMOTER");
  const member = first.roles.find((r: any) => r.kind === "ORGAN_MEMBER");
  assert.deepEqual(
    [promoter.organId, promoter.organName, promoter.title, promoter.position],
    [null, null, null, 0],
  );
  assert.deepEqual(
    [member.organId, member.organName, member.title, member.position],
    [organ.id, "Consiglio di amministrazione", "Presidente", 0],
  );

  const second = await createPerson({ name: "Bruno", roles: [{ kind: "PROMOTER" }, { kind: "ORGAN_MEMBER", organId: organ.id }] });
  assert.deepEqual(second.roles.map((r: any) => r.position), [1, 1]);
  const members = (await request("GET", `${ORGANS}/${organ.id}`, { token })).json;
  assert.equal(members.memberCount, 2);
});

test("invalid values are 400", async () => {
  const organ = await createOrgan();
  const pdf = await createMedia("application/pdf");
  const role = (extra: Record<string, unknown>) => ({ roles: [{ kind: "PROMOTER", ...extra }] });
  const twenty = Array.from({ length: 20 }, (_, i) => ({ kind: "ORGAN_MEMBER", organId: organ.id, title: String(i) }));

  assert.equal((await post({ name: "n".repeat(120), bio: "b".repeat(3000), roles: [{ kind: "TEAM", title: "t".repeat(120) }] })).status, 201);

  const bad: Record<string, unknown>[] = [
    {},
    { name: "" },
    { name: "   " },
    { name: "n".repeat(121) },
    { name: "Due\nrighe" },
    { bio: "b".repeat(3001) },
    { extra: 1 },
    { status: "OTHER" },
    { roles: "PROMOTER" },
    { roles: {} },
    { roles: [...twenty, { kind: "PROMOTER" }] },
    { roles: ["PROMOTER"] },
    { roles: [{ kind: "OTHER" }] },
    { roles: [{}] },
    { roles: [{ kind: "ORGAN_MEMBER" }] },
    { roles: [{ kind: "ORGAN_MEMBER", organId: "no" }] },
    { roles: [{ kind: "ORGAN_MEMBER", organId: UNKNOWN_ID }] },
    role({ organId: organ.id }),
    role({ title: "t".repeat(121) }),
    role({ title: "a\nb" }),
    role({ position: -1 }),
    role({ position: 10000 }),
    { roles: [{ kind: "PROMOTER" }, { kind: "PROMOTER", title: "x" }] },
    { roles: [{ kind: "ORGAN_MEMBER", organId: organ.id }, { kind: "ORGAN_MEMBER", organId: organ.id }] },
    { photoId: "no" },
    { photoId: UNKNOWN_ID },
    { photoId: pdf.id },
  ];
  for (const extra of bad) {
    const body = { name: "Valida", ...extra };
    if (Object.keys(extra).length === 0) delete (body as any).name;
    const res = await post(body);
    assert.equal(res.status, 400, JSON.stringify(extra));
  }
  assert.equal((await listPeople()).length, 1, "nothing was created by the refused requests");

  const messages = [
    [{ roles: [{ kind: "ORGAN_MEMBER" }] }, "organId is required for ORGAN_MEMBER"],
    [role({ organId: organ.id }), "organId is only allowed for ORGAN_MEMBER"],
    [{ roles: [{ kind: "TEAM" }, { kind: "TEAM" }] }, "duplicate role"],
  ] as const;
  for (const [extra, text] of messages) {
    const res = await post({ name: "Valida", ...extra });
    assert.match(res.json.error, new RegExp(text));
  }
});

test("PATCH replaces the roles as a whole and keeps the position of a role that stays", async () => {
  const organ = await createOrgan();
  const person = await createPerson({
    roles: [{ kind: "TEAM", title: "Vecchio" }, { kind: "PROMOTER" }, { kind: "ORGAN_MEMBER", organId: organ.id, position: 5 }],
  });
  await createPerson({ name: "Altro", roles: [{ kind: "TEAM" }, { kind: "TEAM" }].slice(0, 1) });
  const team = person.roles.find((r: any) => r.kind === "TEAM");

  const res = await patch(person.id, {
    roles: [{ kind: "TEAM", title: "Nuovo" }, { kind: "ORGAN_MEMBER", organId: organ.id }, { kind: "AMBASSADOR" }],
  });
  assert.equal(res.status, 200, JSON.stringify(res.json));
  const roles = res.json.roles;
  assert.equal(roles.length, 3, "the promoter role is gone");
  assert.ok(!roles.some((r: any) => r.kind === "PROMOTER"));
  const newTeam = roles.find((r: any) => r.kind === "TEAM");
  assert.deepEqual([newTeam.id, newTeam.title, newTeam.position], [team.id, "Nuovo", team.position]);
  const member = roles.find((r: any) => r.kind === "ORGAN_MEMBER");
  assert.equal(member.position, 5, "same role without position keeps its own");
  assert.equal(member.title, null);
  assert.equal(roles.find((r: any) => r.kind === "AMBASSADOR").position, 0);

  const moved = await patch(person.id, { roles: [{ kind: "TEAM", position: 7 }] });
  assert.deepEqual(moved.json.roles.map((r: any) => [r.kind, r.position]), [["TEAM", 7]]);

  const cleared = await patch(person.id, { roles: [] });
  assert.equal(cleared.status, 200);
  assert.deepEqual(cleared.json.roles, []);
});

test("PATCH changes fields, bio null clears it, status publishes once, an empty body is 400", async () => {
  const person = await createPerson({ bio: "Una bio." });
  assert.equal((await patch(person.id, {})).status, 400);
  assert.equal((await patch(person.id, { roles: "x" })).status, 400);
  assert.equal((await patch(person.id, { name: "" })).status, 400);

  const renamed = await patch(person.id, { name: "Anna Bianchi" });
  assert.deepEqual([renamed.json.name, renamed.json.bio], ["Anna Bianchi", "Una bio."]);
  assert.equal((await patch(person.id, { bio: null })).json.bio, null);

  const published = await patch(person.id, { status: "PUBLISHED" });
  assert.equal(published.json.status, "PUBLISHED");
  const at = published.json.publishedAt;
  assert.ok(Date.parse(at) > 0);
  const back = await patch(person.id, { status: "DRAFT" });
  assert.equal(back.json.publishedAt, at, "publishedAt does not reset");
  assert.equal((await patch(person.id, { status: "PUBLISHED" })).json.publishedAt, at);

  assert.equal((await patch(UNKNOWN_ID, { name: "X" })).status, 404);
  assert.equal((await patch("not-a-uuid", { name: "X" })).status, 404);
  assert.equal((await getOne(UNKNOWN_ID)).status, 404);
});

test("the photo is resolved, and a deleted media leaves the person with photo null", async () => {
  const media = await createMedia("image/png", "Anna");
  const person = await createPerson({ photoId: media.id });
  assert.equal(person.photo.id, media.id);
  assert.equal(person.photo.alt, "Anna");
  assert.match(person.photo.url, /^https?:\/\//);
  assert.deepEqual(Object.keys(person.photo).sort(), ["alt", "id", "url"]);

  await prisma.media.delete({ where: { id: media.id } });
  assert.equal((await getOne(person.id)).json.photo, null);
  assert.equal((await listPeople())[0].photo, null);

  const other = await createMedia("image/webp");
  assert.equal((await patch(person.id, { photoId: other.id })).json.photo.id, other.id);
  assert.equal((await patch(person.id, { photoId: null })).json.photo, null);
  const pdf = await createMedia("application/pdf");
  assert.equal((await patch(person.id, { photoId: pdf.id })).status, 400);
});

test("the list filters by role and status and is ordered by name, then creation", async () => {
  const organ = await createOrgan();
  await createPerson({ name: "Carla", status: "PUBLISHED", roles: [{ kind: "ORGAN_MEMBER", organId: organ.id }] });
  await createPerson({ name: "Bruno", status: "DRAFT", roles: [{ kind: "ORGAN_MEMBER", organId: organ.id }] });
  await createPerson({ name: "Anna", status: "PUBLISHED", roles: [{ kind: "PROMOTER" }] });
  const dup1 = await createPerson({ name: "Dario" });
  const dup2 = await createPerson({ name: "Dario" });

  assert.deepEqual(names(await listPeople()), ["Anna", "Bruno", "Carla", "Dario", "Dario"]);
  assert.deepEqual((await listPeople()).slice(3).map((p) => p.id), [dup1.id, dup2.id]);
  assert.deepEqual(names(await listPeople("?role=ORGAN_MEMBER")), ["Bruno", "Carla"]);
  assert.deepEqual(names(await listPeople("?role=ORGAN_MEMBER&status=PUBLISHED")), ["Carla"]);
  assert.deepEqual(names(await listPeople("?status=DRAFT")), ["Bruno", "Dario", "Dario"]);
  assert.deepEqual(names(await listPeople("?role=TEAM")), []);
  assert.deepEqual(names(await listPeople("?role=TEAM&role=PROMOTER")), ["Anna"], "the last one counts");

  for (const query of ["?role=", "?status=", "?role=OTHER", "?status=OTHER", "?role=promoter"]) {
    assert.equal((await request("GET", `${PEOPLE}${query}`, { token })).status, 400, query);
  }
});

test("deleting a person removes its roles; deleting an organ removes the roles in it", async () => {
  const organ = await createOrgan();
  const keep = await createOrgan("Comitato");
  const person = await createPerson({
    roles: [{ kind: "PROMOTER" }, { kind: "ORGAN_MEMBER", organId: organ.id }, { kind: "ORGAN_MEMBER", organId: keep.id }],
  });
  const other = await createPerson({ name: "Bruno", roles: [{ kind: "ORGAN_MEMBER", organId: organ.id }] });
  assert.equal((await request("GET", `${ORGANS}/${organ.id}`, { token })).json.memberCount, 2);

  assert.equal((await request("DELETE", `${ORGANS}/${organ.id}`, { token })).status, 204);
  const after = (await getOne(person.id)).json;
  assert.deepEqual(
    after.roles.map((r: any) => r.organName).sort((a: any, b: any) => String(a).localeCompare(String(b))),
    ["Comitato", null],
  );
  assert.deepEqual((await getOne(other.id)).json.roles, []);

  assert.equal((await request("DELETE", `${PEOPLE}/${person.id}`, { token })).status, 204);
  assert.equal(await prisma.personRole.count({ where: { personId: person.id } }), 0);
  assert.equal((await request("GET", `${ORGANS}/${keep.id}`, { token })).json.memberCount, 0);
  assert.equal((await request("DELETE", `${PEOPLE}/${person.id}`, { token })).status, 404);
});

test("PATCH against DELETE at the same time is 200 or 404, never 500", async () => {
  const organ = await createOrgan();
  for (let i = 0; i < 12; i++) {
    const person = await createPerson({ name: `P${i}` });
    const [a, b] = await Promise.all([
      patch(person.id, { name: "Cambiato", roles: [{ kind: "PROMOTER" }, { kind: "ORGAN_MEMBER", organId: organ.id }] }),
      request("DELETE", `${PEOPLE}/${person.id}`, { token }),
    ]);
    assert.ok([200, 404].includes(a.status), `patch ${a.status} ${JSON.stringify(a.json)}`);
    assert.equal(b.status, 204);
    assert.equal(await prisma.personRole.count({ where: { personId: person.id } }), 0);
  }
});

test("two PATCH with the same new role never give a 500", async () => {
  for (let i = 0; i < 10; i++) {
    const person = await createPerson({ name: `P${i}` });
    const results = await Promise.all([
      patch(person.id, { roles: [{ kind: "TEAM", title: "A" }] }),
      patch(person.id, { roles: [{ kind: "TEAM", title: "B" }] }),
    ]);
    for (const res of results) assert.ok([200, 409].includes(res.status), `${res.status} ${JSON.stringify(res.json)}`);
    assert.equal((await getOne(person.id)).json.roles.length, 1);
  }
});
