import { authThrottlePool } from "@/lib/server/database";
import { resetAuthRateLimits } from "../helpers/auth-rate-limits";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => request.headers,
  cookies: async () => ({ set: vi.fn(), get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
  notFound: () => { throw new Error("not-found"); },
}));
vi.mock("@/lib/server/email", () => ({ sendAuthEmail: vi.fn() }));

import { auth } from "@/lib/auth";
import { db, pool } from "@/db";
import { member, organization, rateLimit, user } from "@/db/schema";
import { createWorkspace, listWorkspaces, requireWorkspace } from "@/features/workspaces/data";
import { preferredWorkspaceId } from "@/features/workspaces/preference";
import { workspaceFormInput } from "@/features/workspaces/validation";
import { createWorkspaceAction } from "@/features/workspaces/actions";

const runId = randomUUID();
const people: string[] = [];
const organizations: string[] = [];
let verified: { id: string; cookie: string };
let outsider: { id: string; cookie: string };
let unverified: { id: string; cookie: string };

async function person(verified = true) {
  const id = randomUUID();
  // Fixture sessions use the real auth API to issue correctly signed cookies.
  const email = `${id}@example.com`;
  const password = "Workspace-password-123!";
  const signup = await auth.handler(new Request("http://localhost:3000/api/auth/sign-up/email", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": `192.0.2.${people.length + 1}` },
    body: JSON.stringify({ name: "Workspace tester", email: `auth-${email}`, password }),
  }));
  expect(signup.status).toBe(200);
  const result = await signup.json();
  people.push(result.user.id);
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, result.user.id));
  const response = await auth.handler(new Request("http://localhost:3000/api/auth/sign-in/email", {
    method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json", "x-forwarded-for": `192.0.2.${people.length + 1}` },
    body: JSON.stringify({ email: `auth-${email}`, password }),
  }));
  expect(response.status).toBe(200);
  if (!verified) await db.update(user).set({ emailVerified: false }).where(eq(user.id, result.user.id));
  return { id: result.user.id as string, cookie: response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ") };
}

function signedIn(person: { cookie: string } | null) {
  request.headers = new Headers(person ? { cookie: person.cookie } : {});
}
async function resetLimit(id = verified.id) {
  await db.delete(rateLimit).where(eq(rateLimit.key, `workspace-create:${id}`));
}
async function create(slug: string, name = "Example workspace") {
  const result = await createWorkspace({ name, slug });
  if (result.workspace) organizations.push(result.workspace.id);
  return result;
}

beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await resetAuthRateLimits();
  verified = await person();
  outsider = await person();
  unverified = await person(false);
});
afterAll(async () => {
  if (organizations.length) await db.delete(organization).where(inArray(organization.id, organizations));
  if (people.length) {
    await db.delete(rateLimit).where(inArray(rateLimit.key, people.map((id) => `workspace-create:${id}`)));
    await db.delete(user).where(inArray(user.id, people));
  }
  await authThrottlePool.end();
  await pool.end();
});

describe("workspace creation and access with real PostgreSQL and sessions", () => {
  it("requires a verified session at every data entry point", async () => {
    for (const person of [null, unverified]) {
      signedIn(person);
      await expect(createWorkspace({ name: "Private", slug: `denied-${runId}` })).rejects.toThrow("redirect:/login");
      await expect(listWorkspaces()).rejects.toThrow("redirect:/login");
      await expect(requireWorkspace("private")).rejects.toThrow("redirect:/login");
    }
  });

  it("creates exactly a fixed owner membership with only the public projection", async () => {
    signedIn(verified);
    await resetLimit();
    const result = await create(`owned-${runId}`, "  Example workspace  ");
    expect(result.workspace).toEqual({ id: expect.any(String), name: "Example workspace", slug: `owned-${runId}`, role: "owner" });
    const memberships = await db.select().from(member).where(eq(member.organizationId, result.workspace!.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ role: "owner", userId: verified.id });
    expect(await requireWorkspace(result.workspace!.slug, ["owner"])).toEqual(result.workspace);
    expect(await listWorkspaces()).toContainEqual(result.workspace);
  });

  it("rejects malformed and forged application fields, including duplicate form fields", async () => {
    signedIn(verified);
    for (const input of [
      { name: "a", slug: "abc" }, { name: "Valid", slug: "ab" }, { name: "Valid", slug: "Uppercase" },
      { name: "Valid", slug: "two--hyphens" }, { name: "Valid", slug: "-leading" },
      { name: "Valid", slug: "trailing-" }, { name: "Valid", slug: "a".repeat(64) },
      { name: "a".repeat(101), slug: "valid" }, { name: "Valid", slug: "unicode-é" },
      ...["role", "userId", "logo", "metadata", "members"].map((key) => ({ name: "Valid", slug: "valid", [key]: "forged" })),
    ]) {
      await resetLimit();
      expect((await createWorkspace(input)).error).toBeTruthy();
    }
    const form = new FormData();
    form.append("name", "Valid"); form.append("slug", "valid"); form.append("$ACTION_ID_abc", "");
    expect(workspaceFormInput(form)).toEqual({ name: "Valid", slug: "valid" });
    form.append("role", "owner");
    await resetLimit();
    expect((await createWorkspaceAction({ error: "" }, form)).error).toBeTruthy();
    form.delete("role"); form.append("name", "Second name");
    expect(workspaceFormInput(form)).toBeNull();
    expect(await db.select().from(organization).where(eq(organization.slug, "valid"))).toHaveLength(0);
  });

  it("settles duplicate and concurrent slug collisions using the unique database constraint", async () => {
    signedIn(verified); await resetLimit();
    const slug = `race-${runId}`;
    const results = await Promise.all([create(slug), create(slug)]);
    expect(results.filter((result) => result.workspace)).toHaveLength(1);
    expect(results.find((result) => result.error)?.error).toContain("already in use");
    expect((await create(slug)).error).toContain("already in use");
    const rows = await db.select().from(organization).where(eq(organization.slug, slug));
    expect(rows).toHaveLength(1);
    expect(await db.select().from(member).where(eq(member.organizationId, rows[0].id))).toHaveLength(1);
  });

  it("rolls back the organization if owner membership insertion fails", async () => {
    signedIn(verified); await resetLimit();
    const trigger = `workspace_test_${runId.replaceAll("-", "")}`;
    const slug = `rollback-${runId}`;
    // The trigger targets only this isolated fixture and forces a real database failure.
    await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.organization_id IN (SELECT id FROM organization WHERE slug = '${slug}') THEN RAISE EXCEPTION 'fixture membership failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON member FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try {
      expect((await create(slug)).error).toBe("Unable to create the workspace. Please try again.");
      expect(await db.select().from(organization).where(eq(organization.slug, slug))).toHaveLength(0);
      expect((await db.select().from(rateLimit).where(eq(rateLimit.key, `workspace-create:${verified.id}`)))[0].count).toBe(1);
    } finally {
      await pool.query(`DROP TRIGGER ${trigger} ON member`);
      await pool.query(`DROP FUNCTION ${trigger}()`);
    }
  });

  it("fails closed with a useful error if the persistent rate counter fails", async () => {
    signedIn(verified); await resetLimit();
    const trigger = `limiter_test_${runId.replaceAll("-", "")}`;
    const slug = `counter-failure-${runId}`;
    await pool.query(`CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.key = 'workspace-create:${verified.id}' THEN RAISE EXCEPTION 'fixture counter failure'; END IF; RETURN NEW; END $$`);
    await pool.query(`CREATE TRIGGER ${trigger} BEFORE INSERT ON rate_limit FOR EACH ROW EXECUTE FUNCTION ${trigger}()`);
    try {
      expect((await create(slug)).error).toBe("Unable to create the workspace. Please try again.");
      expect(await db.select().from(organization).where(eq(organization.slug, slug))).toHaveLength(0);
    } finally {
      await pool.query(`DROP TRIGGER ${trigger} ON rate_limit`);
      await pool.query(`DROP FUNCTION ${trigger}()`);
    }
  });

  it("limits all attempts atomically per user and renews the 60 second window", async () => {
    signedIn(verified); await resetLimit();
    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => create(`limited-${index}-${runId}`)));
    expect(results.filter((result) => result.workspace)).toHaveLength(5);
    expect(results.filter((result) => result.error?.includes("Too many"))).toHaveLength(7);
    await resetLimit();
    for (let index = 0; index < 5; index++) expect((await createWorkspace({ role: "owner" })).error).not.toContain("Too many");
    expect((await createWorkspace({ name: "Valid", slug: `after-invalid-${runId}` })).error).toContain("Too many");
    await db.update(rateLimit).set({ lastRequest: Date.now() - 60_001 }).where(eq(rateLimit.key, `workspace-create:${verified.id}`));
    expect((await create(`renewed-${runId}`)).workspace).toBeTruthy();
    signedIn(outsider); await resetLimit(outsider.id);
    expect((await create(`outsider-${runId}`)).workspace).toBeTruthy();
  });

  it("scopes reads to current membership, allows known roles, and revokes live sessions immediately", async () => {
    signedIn(verified); await resetLimit();
    const created = (await create(`access-${runId}`)).workspace!;
    signedIn(outsider);
    expect(await listWorkspaces()).not.toContainEqual(created);
    await expect(requireWorkspace(created.slug)).rejects.toThrow("not-found");
    await expect(requireWorkspace("does-not-exist")).rejects.toThrow("not-found");
    const membershipId = randomUUID();
    await db.insert(member).values({ id: membershipId, organizationId: created.id, userId: outsider.id, role: "member", createdAt: new Date() });
    for (const role of ["member", "admin", "owner"] as const) {
      await db.update(member).set({ role }).where(eq(member.id, membershipId));
      expect((await requireWorkspace(created.slug)).role).toBe(role);
      if (role !== "owner") await expect(requireWorkspace(created.slug, ["owner"])).rejects.toThrow("not-found");
    }
    await db.update(member).set({ role: "unknown" }).where(eq(member.id, membershipId));
    await expect(requireWorkspace(created.slug)).rejects.toThrow("not-found");
    expect((await listWorkspaces()).find((workspace) => workspace.id === created.id)).toBeUndefined();
    await db.delete(member).where(and(eq(member.organizationId, created.id), eq(member.userId, outsider.id)));
    await expect(requireWorkspace(created.slug)).rejects.toThrow("not-found");
    const session = await auth.api.getSession({ headers: request.headers });
    expect(session?.user.id).toBe(outsider.id);
  });

  it("ignores malformed, stale, and other-user navigation preferences", () => {
    expect(preferredWorkspaceId(JSON.stringify([verified.id, "workspace-id"]), verified.id)).toBe("workspace-id");
    for (const value of [undefined, "garbage", "null", "{}", JSON.stringify([outsider.id, "workspace-id"]), "a".repeat(501)]) {
      expect(preferredWorkspaceId(value, verified.id)).toBeUndefined();
    }
  });
});

// Authentication uses one local bucket, so each test starts with a fresh budget.
beforeEach(resetAuthRateLimits);
