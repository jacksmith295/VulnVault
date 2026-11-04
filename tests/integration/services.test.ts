import { authThrottlePool } from "@/lib/server/database";
import { resetAuthRateLimits } from "../helpers/auth-rate-limits";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect:${path}`); }, notFound: () => { throw new Error("not-found"); } }));
vi.mock("@/lib/server/email", () => ({ sendAuthEmail: vi.fn() }));
import { auth } from "@/lib/auth";
import { db, pool } from "@/db";
import { member, organization, service, user } from "@/db/schema";
import { changeServiceArchive, createService, editService, listServices, requireService } from "@/features/services/data";
import { serviceFormInput, serviceSchema } from "@/features/services/validation";

const run = randomUUID();
const workspaceId = randomUUID();
const otherId = randomUUID();
const slug = `services-${run}`;
const otherSlug = `other-${run}`;
let userId: string;
let cookie: string;
let membershipId: string;
const input = { name: "API service", description: "  Useful service  ", repositoryUrls: [" HTTPS://Git.Example:8443/Team/API.git/// ", "http://internal:8080/team/ui"] };

function signedIn() { request.headers = new Headers({ cookie }); }
async function role(value: string) { await db.update(member).set({ role: value }).where(eq(member.id, membershipId)); }
async function create() {
  const result = await createService(slug, input);
  expect(result.error).toBeUndefined();
  return result.service!;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await resetAuthRateLimits();
  const email = `service-${run}@example.com`;
  const password = "Service-password-123!";
  const headers = { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}` };
  const signup = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", { method: "POST", headers, body: JSON.stringify({ name: "Service tester", email, password }) }));
  expect(signup.status).toBe(200);
  userId = (await signup.json()).user.id;
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
  const login = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST", headers, body: JSON.stringify({ email, password }) }));
  expect(login.status).toBe(200);
  cookie = login.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");
  signedIn();
  await db.insert(organization).values([{ id: workspaceId, slug, name: "Services", createdAt: new Date() }, { id: otherId, slug: otherSlug, name: "Other", createdAt: new Date() }]);
  membershipId = randomUUID();
  await db.insert(member).values([{ id: membershipId, userId, organizationId: workspaceId, role: "owner", createdAt: new Date() }, { id: randomUUID(), userId, organizationId: otherId, role: "member", createdAt: new Date() }]);
});
afterAll(async () => {
  await db.delete(service).where(inArray(service.workspaceId, [workspaceId, otherId]));
  await db.delete(organization).where(inArray(organization.id, [workspaceId, otherId]));
  if (userId) await db.delete(user).where(eq(user.id, userId));
  await authThrottlePool.end();
  await pool.end();
});

describe("service management with real PostgreSQL and sessions", () => {
  it("requires verified authentication on reads and all mutations", async () => {
    for (const verified of [true, false]) {
      request.headers = verified ? new Headers() : new Headers({ cookie });
      if (!verified) await db.update(user).set({ emailVerified: false }).where(eq(user.id, userId));
      try {
        await expect(listServices(slug)).rejects.toThrow("redirect:/login");
        await expect(requireService(slug, "unknown")).rejects.toThrow("redirect:/login");
        await expect(createService(slug, input)).rejects.toThrow("redirect:/login");
        await expect(editService(slug, "unknown", 1, input)).rejects.toThrow("redirect:/login");
        await expect(changeServiceArchive(slug, "unknown", 1, true)).rejects.toThrow("redirect:/login");
      } finally { await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId)); }
    }
    signedIn();
  });

  it("validates and normalizes URLs, rejects forged and duplicate form fields", () => {
    expect(serviceSchema.parse({ name: "Minimal service" })).toEqual({ name: "Minimal service", description: null, repositoryUrls: [] });
    expect(serviceSchema.parse(input)).toMatchObject({ description: "Useful service", repositoryUrls: ["https://git.example:8443/Team/API.git", "http://internal:8080/team/ui"] });
    expect(serviceSchema.parse({ ...input, description: " ", repositoryUrls: [] }).description).toBeNull();
    for (const repositoryUrls of [["https://host/repo", " HTTPS://HOST/repo/ "], ["https://token:secret@host/repo"], ["https://host"], ["https://host/repo?token=x"], ["https://host/repo#"], ["file:///repo"], Array(21).fill("https://host/repo")]) {
      expect(serviceSchema.safeParse({ ...input, repositoryUrls }).success).toBe(false);
    }
    for (const invalid of [{ ...input, name: "a" }, { ...input, name: "a".repeat(101) }, { ...input, description: "x".repeat(5001) }, { ...input, workspaceId: otherId }, { ...input, version: 1 }]) expect(serviceSchema.safeParse(invalid).success).toBe(false);
    const form = new FormData();
    form.set("name", "Form service"); form.set("description", ""); form.set("repositoryUrls", "https://host/repo\n\nhttp://internal/repo\n"); form.set("$ACTION_ID_123", "");
    expect(serviceFormInput(form)).toEqual({ name: "Form service", description: "", repositoryUrls: ["https://host/repo", "http://internal/repo"] });
    form.append("name", "duplicate"); expect(serviceFormInput(form)).toBeNull();
  });

  it("creates atomically, permits duplicate names/URLs across services and retains association IDs on edit", async () => {
    const created = await create();
    const duplicate = await create();
    expect(duplicate.id).not.toBe(created.id);
    const original = await requireService(slug, created.id);
    expect(original.repositories).toHaveLength(2);
    const retained = original.repositories.find((row) => row.url.endsWith("API.git"))!;
    const saved = await editService(slug, created.id, 1, { name: "Renamed", description: "", repositoryUrls: [retained.url, "https://host/new"] });
    expect(saved.service).toMatchObject({ id: created.id, name: "Renamed", version: 2, description: null });
    expect((await requireService(slug, created.id)).repositories).toContainEqual(retained);
    expect((await editService(slug, created.id, 1, { ...input, repositoryUrls: [] })).conflict).toBe(true);
    expect((await requireService(slug, created.id)).repositories).toHaveLength(2);
  });

  it("fails closed per workspace role and forged IDs, including revoked live membership", async () => {
    const created = await create();
    for (const value of ["member", "unknown"]) {
      await role(value);
      expect((await createService(slug, input)).error).toBeTruthy();
      expect((await editService(slug, created.id, 1, input)).error).toBeTruthy();
      expect((await changeServiceArchive(slug, created.id, 1, true)).error).toBeTruthy();
      if (value === "member") expect((await requireService(slug, created.id)).service.id).toBe(created.id);
      else await expect(requireService(slug, created.id)).rejects.toThrow("not-found");
    }
    await role("admin");
    expect((await editService(slug, created.id, 1, input)).service?.version).toBe(2);
    expect((await createService(otherSlug, input)).error).toBeTruthy();
    await expect(requireService(otherSlug, created.id)).rejects.toThrow("not-found");
    expect((await editService(otherSlug, created.id, 2, input)).error).toBeTruthy();
    await db.update(member).set({ role: "owner" }).where(and(eq(member.userId, userId), eq(member.organizationId, otherId)));
    const scopedBefore = await requireService(slug, created.id);
    expect((await editService(otherSlug, created.id, 2, { ...input, repositoryUrls: [] })).error).toBeTruthy();
    expect(await requireService(slug, created.id)).toEqual(scopedBefore);
    expect((await changeServiceArchive(otherSlug, created.id, 2, true)).error).toBeTruthy();
    await db.delete(member).where(eq(member.id, membershipId));
    expect((await createService(slug, input)).error).toBeTruthy();
    await expect(requireService(slug, created.id)).rejects.toThrow("not-found");
    await db.insert(member).values({ id: membershipId, userId, organizationId: workspaceId, role: "owner", createdAt: new Date() });
  });

  it("enforces integer versions, concurrent edit conflicts, archive states and restore", async () => {
    const created = await create();
    expect((await editService(slug, created.id, 1.5, input)).conflict).toBe(true);
    const edits = await Promise.all([editService(slug, created.id, 1, { ...input, name: "First" }), editService(slug, created.id, 1, { ...input, name: "Second" })]);
    expect(edits.filter((result) => result.service)).toHaveLength(1);
    expect(edits.filter((result) => result.conflict)).toHaveLength(1);
    expect((await changeServiceArchive(slug, created.id, 2, true)).service?.version).toBe(3);
    expect((await listServices(slug)).services.some((row) => row.id === created.id)).toBe(false);
    expect((await listServices(slug, true)).services.some((row) => row.id === created.id)).toBe(true);
    expect((await editService(slug, created.id, 3, input)).conflict).toBe(true);
    expect((await changeServiceArchive(slug, created.id, 3, true)).conflict).toBe(true);
    expect((await changeServiceArchive(slug, created.id, 2, false)).conflict).toBe(true);
    expect((await changeServiceArchive(slug, created.id, 3, false)).service?.version).toBe(4);
    expect((await changeServiceArchive(slug, created.id, 4, false)).conflict).toBe(true);
  });

  it("rolls back creation and edits if repository persistence fails", async () => {
    const created = await create();
    const before = await requireService(slug, created.id);
    const trigger = `service_test_${run.replaceAll("-", "")}`;
    const failureUrl = `https://host/${run}`;
    await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.url = '${failureUrl}' THEN RAISE EXCEPTION 'fixture repository failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON service_repository FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try {
      expect((await createService(slug, { ...input, name: run, repositoryUrls: [failureUrl] })).error).toContain("Unable to create");
      expect(await db.select().from(service).where(eq(service.name, run))).toHaveLength(0);
      expect((await editService(slug, created.id, 1, { ...input, name: "Failed edit", repositoryUrls: [failureUrl] })).error).toContain("Unable to save");
      expect(await requireService(slug, created.id)).toEqual(before);
    } finally {
      await pool.query(`DROP TRIGGER ${trigger} ON service_repository`);
      await pool.query(`DROP FUNCTION ${trigger}()`);
    }
  });

  it("holds a membership share lock through mutation commit so role updates wait", async () => {
    const created = await create();
    const blocker = await pool.connect();
    const demoter = await pool.connect();
    let mutation: ReturnType<typeof editService> | undefined;
    let demotion: Promise<unknown> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM service WHERE id = $1 FOR UPDATE", [created.id]);
      mutation = editService(slug, created.id, 1, { ...input, name: "Serialized edit" });
      // Wait for the service UPDATE: it can only be reached after membership FOR SHARE acquired its lock.
      const deadline = Date.now() + 5000;
      let waiting = false;
      while (Date.now() < deadline) {
        await blocker.query("SELECT pg_stat_clear_snapshot()");
        const result = await blocker.query("SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'update \"service\"%' AND pid <> pg_backend_pid()");
        if (result.rowCount) { waiting = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      let demoted = false;
      demotion = demoter.query("UPDATE member SET role = 'member' WHERE id = $1", [membershipId]);
      void demotion!.then(() => { demoted = true; });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(demoted).toBe(false);
      await blocker.query("COMMIT");
      expect((await mutation).service?.name).toBe("Serialized edit");
      await demotion;
      expect((await editService(slug, created.id, 2, input)).error).toBeTruthy();
    } finally {
      await blocker.query("ROLLBACK");
      await mutation;
      await demotion;
      blocker.release(); demoter.release();
      await role("owner");
    }
  });

  it("applies the additive upgrade without changing existing workspace, member or legacy rows", async () => {
    const connection = await pool.connect();
    const schema = `upgrade_${run.replaceAll("-", "")}`;
    try {
      await connection.query(`CREATE SCHEMA ${schema}`);
      await connection.query(`SET search_path TO ${schema}`);
      // Isolated old-schema fixtures let the actual migration run without touching development or existing test tables.
      await connection.query("CREATE TABLE organization (id text PRIMARY KEY, name text NOT NULL); CREATE TABLE member (id text PRIMARY KEY, organization_id text); CREATE TABLE users (id text PRIMARY KEY, email text)");
      await connection.query("INSERT INTO organization VALUES ('old-workspace','Preserved'); INSERT INTO member VALUES ('old-member','old-workspace'); INSERT INTO users VALUES ('old-user','old@example.com')");
      const migration = (await readFile("drizzle/0002_free_master_mold.sql", "utf8")).replaceAll('"public".', `"${schema}".`);
      await connection.query(migration);
      expect((await connection.query("SELECT * FROM organization")).rows).toEqual([{ id: "old-workspace", name: "Preserved" }]);
      expect((await connection.query("SELECT * FROM member")).rows).toHaveLength(1);
      expect((await connection.query("SELECT * FROM users")).rows).toHaveLength(1);
      await connection.query("INSERT INTO service (id,workspace_id,name) VALUES ('old-service','old-workspace','Service')");
      await expect(connection.query("DELETE FROM organization WHERE id = 'old-workspace'")).rejects.toThrow();
    } finally {
      await connection.query("SET search_path TO public");
      await connection.query(`DROP SCHEMA ${schema} CASCADE`);
      connection.release();
    }
  });
});

// Authentication uses one local bucket, so each test starts with a fresh budget.
beforeEach(resetAuthRateLimits);
