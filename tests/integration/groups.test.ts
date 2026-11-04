import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => request.headers }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
  notFound: () => {
    throw new Error("not-found");
  },
}));
vi.mock("@/lib/server/email", () => ({ sendAuthEmail: vi.fn() }));
import { auth } from "@/lib/auth";
import { db, pool } from "@/db";
import {
  member,
  organization,
  service,
  user,
  workspaceGroup,
  groupMembership,
  serviceAccessGroup,
  finding,
} from "@/db/schema";
import { createWorkspace } from "@/features/workspaces/data";
import {
  createService,
  editService,
  changeServiceArchive,
  listServices,
  requireService,
} from "@/features/services/data";
import {
  createFinding,
  editFinding,
  listFindings,
  requireFinding,
} from "@/features/findings/data";
import {
  createGroup,
  editGroup,
  listGroups,
  requireGroup,
  getServiceAccess,
  changeServiceAccess,
} from "@/features/groups/data";
import {
  createGroupFormInput,
  groupFormInput,
  serviceAccessFormInput,
  createGroupSchema,
  editGroupSchema,
  serviceAccessSchema,
} from "@/features/groups/validation";
import {
  saveGroupAction,
  saveServiceAccessAction,
} from "@/features/groups/actions";
const run = randomUUID();
let userId: string,
  cookie: string,
  adminCookie: string,
  adminUserId: string,
  workspaceId: string,
  otherId: string,
  membershipId: string,
  otherMemberId: string,
  defaultId: string;
const slug = `groups-${run}`,
  otherSlug = `groups-other-${run}`;
const serviceInput = {
  name: "Restricted API",
  repositoryUrls: ["https://host/repo"],
};
const findingInput = {
  title: "A finding",
  description: "Details",
  severity: "high",
  referenceUrls: ["https://host/advisory"],
};
async function role(value: string) {
  await db
    .update(member)
    .set({ role: value })
    .where(eq(member.id, membershipId));
}
async function newGroup(name = "Engineering") {
  const result = await createGroup(slug, { name });
  expect(result.error).toBeUndefined();
  return result.group!;
}
async function newService() {
  const result = await createService(slug, serviceInput);
  expect(result.error).toBeUndefined();
  return result.service!;
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  const email = `groups-${run}@example.com`,
    password = "Group-password-123!";
  const headers = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
    "x-forwarded-for": `198.18.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
  };
  const signup = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Group tester", email, password }),
    }),
  );
  expect(signup.status).toBe(200);
  userId = (await signup.json()).user.id;
  await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
  const login = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    }),
  );
  expect(login.status).toBe(200);
  cookie = login.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  const adminEmail = `groups-admin-${run}@example.com`;
  const adminSignup = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({
        name: "Group administrator",
        email: adminEmail,
        password,
      }),
    }),
  );
  expect(adminSignup.status).toBe(200);
  adminUserId = (await adminSignup.json()).user.id;
  await db
    .update(user)
    .set({ emailVerified: true })
    .where(eq(user.id, adminUserId));
  const adminLogin = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email: adminEmail, password }),
    }),
  );
  expect(adminLogin.status).toBe(200);
  adminCookie = adminLogin.headers
    .getSetCookie()
    .map((v) => v.split(";")[0])
    .join("; ");
  request.headers = new Headers({ cookie });
  const workspace = await createWorkspace({ name: "Groups workspace", slug });
  expect(workspace.error).toBeUndefined();
  workspaceId = workspace.workspace!.id;
  const other = await createWorkspace({
    name: "Other workspace",
    slug: otherSlug,
  });
  expect(other.error).toBeUndefined();
  otherId = other.workspace!.id;
  const memberships = await db
    .select()
    .from(member)
    .where(eq(member.userId, userId));
  membershipId = memberships.find((m) => m.organizationId === workspaceId)!.id;
  otherMemberId = memberships.find((m) => m.organizationId === otherId)!.id;
  await db.insert(member).values({
    id: randomUUID(),
    userId: adminUserId,
    organizationId: workspaceId,
    role: "admin",
    createdAt: new Date(),
  });
  defaultId = (await listGroups(slug)).groups.find((g) => g.isDefault)!.id;
});
afterAll(async () => {
  if (workspaceId) {
    const ids = [workspaceId, otherId].filter(Boolean);
    const services = await db
      .select({ id: service.id })
      .from(service)
      .where(inArray(service.workspaceId, ids));
    if (services.length)
      await db.delete(finding).where(
        inArray(
          finding.serviceId,
          services.map((s) => s.id),
        ),
      );
    await db.delete(service).where(inArray(service.workspaceId, ids));
    await db.delete(organization).where(inArray(organization.id, ids));
  }
  if (userId) await db.delete(user).where(eq(user.id, userId));
  if (adminUserId) await db.delete(user).where(eq(user.id, adminUserId));
  await pool.end();
});
describe("workspace access groups with real PostgreSQL and sessions", () => {
  it("strictly parses scalar/repeated form fields and reserved names", () => {
    const form = new FormData();
    form.set("name", "Engineering");
    expect(
      createGroupSchema.safeParse(createGroupFormInput(form)).success,
    ).toBe(true);
    form.append("memberIds", "a");
    form.append("memberIds", "b");
    expect(editGroupSchema.parse(groupFormInput(form)).memberIds).toEqual([
      "a",
      "b",
    ]);
    expect(
      createGroupSchema.safeParse(createGroupFormInput(form)).success,
    ).toBe(false);
    form.append("name", "Duplicate");
    expect(groupFormInput(form)).toBeNull();
    const access = new FormData();
    access.append("groupIds", "a");
    access.append("groupIds", "b");
    access.set("confirmDefault", "true");
    expect(serviceAccessSchema.parse(serviceAccessFormInput(access))).toEqual({
      groupIds: ["a", "b"],
      confirmDefault: true,
    });
    access.append("confirmDefault", "true");
    expect(serviceAccessFormInput(access)).toBeNull();
    expect(createGroupSchema.safeParse({ name: " EVERYONE " }).success).toBe(
      false,
    );
    expect(
      serviceAccessSchema.safeParse({ groupIds: ["a", "a"] }).success,
    ).toBe(false);
    expect(
      editGroupSchema.safeParse({
        name: "Group",
        memberIds: [],
        workspaceId: otherId,
      }).success,
    ).toBe(false);
  });
  it("creates a protected implicit default and protects tenant scope at the database boundary", async () => {
    expect((await requireGroup(slug, defaultId)).members).toContainEqual(
      expect.objectContaining({ id: membershipId, selected: true }),
    );
    expect(
      (
        await editGroup(slug, defaultId, 1, {
          name: "New default",
          memberIds: [],
        })
      ).error,
    ).toBeTruthy();
    await expect(
      db
        .update(workspaceGroup)
        .set({ isDefault: false })
        .where(eq(workspaceGroup.id, defaultId)),
    ).rejects.toThrow();
    await expect(
      db.delete(workspaceGroup).where(eq(workspaceGroup.id, defaultId)),
    ).rejects.toThrow();
    const group = await newGroup();
    const target = await newService();
    for (const values of [
      { workspaceId, groupId: defaultId, memberId: membershipId },
      { workspaceId, groupId: group.id, memberId: otherMemberId },
      { workspaceId: otherId, groupId: group.id, memberId: otherMemberId },
    ])
      await expect(db.insert(groupMembership).values(values)).rejects.toThrow();
    await expect(
      db
        .insert(serviceAccessGroup)
        .values({ workspaceId, serviceId: target.id, groupId: defaultId }),
    ).rejects.toThrow();
    const other = await createService(otherSlug, serviceInput);
    await expect(
      db.insert(serviceAccessGroup).values({
        workspaceId,
        serviceId: other.service!.id,
        groupId: group.id,
      }),
    ).rejects.toThrow();
    expect(
      (await changeServiceAccess(slug, target.id, 1, { groupIds: [defaultId] }))
        .error,
    ).toBeTruthy();
  });
  it("enforces live group access for every service/finding read and write, with manager bypass", async () => {
    const group = await newGroup("Application team"),
      target = await newService();
    const created = await createFinding(slug, target.id, findingInput);
    expect(created.error).toBeUndefined();
    expect(
      (await changeServiceAccess(slug, target.id, 1, { groupIds: [group.id] }))
        .service?.version,
    ).toBe(2);
    await role("member");
    expect((await listServices(slug)).services.map((s) => s.id)).not.toContain(
      target.id,
    );
    for (const read of [
      () => requireService(slug, target.id),
      () => listFindings(slug, target.id),
      () => requireFinding(slug, target.id, created.finding!.id),
      () => getServiceAccess(slug, target.id),
      () => listGroups(slug),
      () => requireGroup(slug, group.id),
    ])
      await expect(read()).rejects.toThrow("not-found");
    expect(
      (await createFinding(slug, target.id, findingInput)).error,
    ).toBeTruthy();
    expect(
      (
        await editFinding(slug, target.id, created.finding!.id, 1, {
          ...findingInput,
          status: "triaged",
        })
      ).error,
    ).toBeTruthy();
    for (const write of [
      () => createGroup(slug, { name: "Denied" }),
      () =>
        editGroup(slug, group.id, 1, {
          name: group.name,
          memberIds: [membershipId],
        }),
      () =>
        changeServiceAccess(slug, target.id, 2, {
          groupIds: [],
          confirmDefault: true,
        }),
    ])
      expect((await write()).error).toBeTruthy();
    await role("owner");
    expect(
      (
        await editGroup(slug, group.id, 1, {
          name: group.name,
          memberIds: [membershipId],
        })
      ).group?.version,
    ).toBe(2);
    await role("member");
    expect((await requireService(slug, target.id)).repositories).toHaveLength(
      1,
    );
    expect(
      (await requireFinding(slug, target.id, created.finding!.id)).references,
    ).toHaveLength(1);
    expect(
      (await createFinding(slug, target.id, findingInput)).finding,
    ).toBeDefined();
    expect(
      (await editService(slug, target.id, 2, serviceInput)).error,
    ).toBeTruthy();
    await role("admin");
    expect(
      (await editGroup(slug, group.id, 2, { name: group.name, memberIds: [] }))
        .group?.version,
    ).toBe(3);
    expect((await requireService(slug, target.id)).service.id).toBe(target.id);
    await role("member");
    await expect(requireService(slug, target.id)).rejects.toThrow("not-found");
    await role("owner");
  });
  it("uses versions atomically, confirms broadening and allows archived permission revocation", async () => {
    const group = await newGroup("Versioned team"),
      target = await newService();
    const edits = await Promise.all([
      editGroup(slug, group.id, 1, {
        name: "First team",
        memberIds: [membershipId],
      }),
      editGroup(slug, group.id, 1, { name: "Second team", memberIds: [] }),
    ]);
    expect(edits.filter((r) => r.group)).toHaveLength(1);
    expect(edits.filter((r) => r.conflict)).toHaveLength(1);
    expect(
      (
        await editGroup(slug, group.id, 2, {
          name: "Tenant mix",
          memberIds: [otherMemberId],
        })
      ).error,
    ).toBeTruthy();
    expect((await requireGroup(slug, group.id)).group.version).toBe(2);
    expect(
      (await changeServiceAccess(slug, target.id, 1, { groupIds: [group.id] }))
        .service?.version,
    ).toBe(2);
    expect((await editService(slug, target.id, 1, serviceInput)).conflict).toBe(
      true,
    );
    expect(
      (await changeServiceAccess(slug, target.id, 2, { groupIds: [] })).error,
    ).toContain("Confirm");
    expect((await getServiceAccess(slug, target.id)).service.version).toBe(2);
    expect(
      (await changeServiceArchive(slug, target.id, 2, true)).service?.version,
    ).toBe(3);
    expect(
      (
        await changeServiceAccess(slug, target.id, 2, {
          groupIds: [],
          confirmDefault: true,
        })
      ).conflict,
    ).toBe(true);
    expect(
      (
        await changeServiceAccess(slug, target.id, 3, {
          groupIds: [],
          confirmDefault: true,
        })
      ).service?.version,
    ).toBe(4);
    expect(
      (await createFinding(slug, target.id, findingInput)).error,
    ).toBeTruthy();
  });
  it("does not resurrect group membership when a workspace member rejoins", async () => {
    const group = await newGroup("Rejoin team"),
      target = await newService();
    expect(
      (
        await editGroup(slug, group.id, 1, {
          name: group.name,
          memberIds: [membershipId],
        })
      ).group,
    ).toBeDefined();
    await changeServiceAccess(slug, target.id, 1, { groupIds: [group.id] });
    await db.delete(member).where(eq(member.id, membershipId));
    membershipId = randomUUID();
    await db.insert(member).values({
      id: membershipId,
      userId,
      organizationId: workspaceId,
      role: "member",
      createdAt: new Date(),
    });
    await expect(requireService(slug, target.id)).rejects.toThrow("not-found");
    await role("owner");
    expect(
      (await requireGroup(slug, group.id)).members.find(
        (m) => m.id === membershipId,
      )?.selected,
    ).toBe(false);
  });
  it("requires verified authentication and fails closed for unknown roles and cross-workspace IDs", async () => {
    const group = await newGroup("Authentication team"),
      target = await newService();
    request.headers = new Headers();
    await expect(listGroups(slug)).rejects.toThrow("redirect:/login");
    await expect(createGroup(slug, { name: "Signed out" })).rejects.toThrow(
      "redirect:/login",
    );
    request.headers = new Headers({ cookie });
    await db
      .update(user)
      .set({ emailVerified: false })
      .where(eq(user.id, userId));
    await expect(
      changeServiceAccess(slug, target.id, 1, { groupIds: [] }),
    ).rejects.toThrow("redirect:/login");
    await db
      .update(user)
      .set({ emailVerified: true })
      .where(eq(user.id, userId));
    await role("unknown");
    await expect(requireService(slug, target.id)).rejects.toThrow("not-found");
    expect(
      (await editGroup(slug, group.id, 1, { name: group.name, memberIds: [] }))
        .error,
    ).toBeTruthy();
    await role("owner");
    expect(
      (
        await editGroup(otherSlug, group.id, 1, {
          name: group.name,
          memberIds: [],
        })
      ).error,
    ).toBeTruthy();
    expect(
      (
        await changeServiceAccess(otherSlug, target.id, 1, {
          groupIds: [group.id],
        })
      ).error,
    ).toBeTruthy();
    await expect(requireGroup(otherSlug, group.id)).rejects.toThrow(
      "not-found",
    );
  });
  it("rejects forged action payloads without changing permissions", async () => {
    const group = await newGroup("Action team"),
      target = await newService();
    for (const [mode, groups] of [
      ["selected", []],
      ["default", [group.id]],
    ] as const) {
      const form = new FormData();
      form.set("accessMode", mode);
      for (const id of groups) form.append("groupIds", id);
      expect(
        (await saveServiceAccessAction(slug, target.id, 1, { error: "" }, form))
          .error,
      ).toBeTruthy();
    }
    const duplicate = new FormData();
    duplicate.append("accessMode", "default");
    duplicate.append("accessMode", "default");
    expect(
      (
        await saveServiceAccessAction(
          slug,
          target.id,
          1,
          { error: "" },
          duplicate,
        )
      ).error,
    ).toBeTruthy();
    const unknown = new FormData();
    unknown.set("accessMode", "default");
    unknown.set("workspaceId", otherId);
    expect(
      (
        await saveServiceAccessAction(
          slug,
          target.id,
          1,
          { error: "" },
          unknown,
        )
      ).error,
    ).toBeTruthy();
    const forged = new FormData();
    forged.set("name", "Injected membership");
    forged.append("memberIds", membershipId);
    expect(
      (await saveGroupAction(slug, null, 1, { error: "" }, forged)).error,
    ).toBeTruthy();
    expect((await getServiceAccess(slug, target.id)).service.version).toBe(1);
    expect(
      (await listGroups(slug)).groups.some(
        (g) => g.name === "Injected membership",
      ),
    ).toBe(false);
  });
  it("serializes revocation after an in-flight finding write without lock-order deadlock", async () => {
    const group = await newGroup("Concurrent team"),
      target = await newService();
    await editGroup(slug, group.id, 1, {
      name: group.name,
      memberIds: [membershipId],
    });
    await changeServiceAccess(slug, target.id, 1, { groupIds: [group.id] });
    const created = await createFinding(slug, target.id, findingInput);
    await role("member");
    const blocker = await pool.connect();
    let write: ReturnType<typeof editFinding> | undefined;
    let revoke: ReturnType<typeof editGroup> | undefined;
    try {
      await blocker.query("BEGIN");
      await blocker.query("SELECT id FROM finding WHERE id=$1 FOR UPDATE", [
        created.finding!.id,
      ]);
      write = editFinding(slug, target.id, created.finding!.id, 1, {
        ...findingInput,
        status: "triaged",
      });
      let waiting = false;
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        await blocker.query("SELECT pg_stat_clear_snapshot()");
        const result = await blocker.query(
          `SELECT 1 FROM pg_stat_activity WHERE wait_event_type='Lock' AND query LIKE 'select%from "finding"%for update%' AND pid<>pg_backend_pid()`,
        );
        if (result.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(waiting).toBe(true);
      request.headers = new Headers({ cookie: adminCookie });
      let revoked = false;
      revoke = editGroup(slug, group.id, 2, {
        name: group.name,
        memberIds: [],
      });
      void revoke.then(() => {
        revoked = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(revoked).toBe(false);
      await blocker.query("COMMIT");
      expect((await write).finding?.status).toBe("triaged");
      expect((await revoke).group?.version).toBe(3);
      request.headers = new Headers({ cookie });
      await expect(requireService(slug, target.id)).rejects.toThrow(
        "not-found",
      );
      expect(
        (await createFinding(slug, target.id, findingInput)).error,
      ).toBeTruthy();
    } finally {
      await blocker.query("ROLLBACK");
      await write;
      await revoke;
      blocker.release();
      request.headers = new Headers({ cookie });
      await role("owner");
    }
  });
  it("rolls back group and service association changes when persistence fails", async () => {
    const first = await newGroup("Rollback first"),
      second = await newGroup("Rollback second"),
      target = await newService();
    await editGroup(slug, first.id, 1, {
      name: first.name,
      memberIds: [membershipId],
    });
    await changeServiceAccess(slug, target.id, 1, { groupIds: [first.id] });
    const groupBefore = await requireGroup(slug, first.id),
      accessBefore = await getServiceAccess(slug, target.id);
    const trigger = `groups_failure_${run.replaceAll("-", "")}`;
    await pool.query(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture failure'; END $$`,
    );
    await pool.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON group_membership FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    await pool.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON service_access_group FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      expect(
        (
          await editGroup(slug, first.id, 2, {
            name: "Failed rename",
            memberIds: [membershipId],
          })
        ).error,
      ).toBeTruthy();
      expect(await requireGroup(slug, first.id)).toEqual(groupBefore);
      expect(
        (
          await changeServiceAccess(slug, target.id, 2, {
            groupIds: [second.id],
          })
        ).error,
      ).toBeTruthy();
      expect(await getServiceAccess(slug, target.id)).toEqual(accessBefore);
    } finally {
      await pool.query(`DROP TRIGGER ${trigger} ON group_membership`);
      await pool.query(`DROP TRIGGER ${trigger} ON service_access_group`);
      await pool.query(`DROP FUNCTION ${trigger}()`);
    }
    await expect(
      db.delete(workspaceGroup).where(eq(workspaceGroup.id, first.id)),
    ).rejects.toThrow();
    await expect(
      db
        .update(workspaceGroup)
        .set({ name: "Renamed default" })
        .where(eq(workspaceGroup.id, defaultId)),
    ).rejects.toThrow();
  });
  it("backfills the additive migration without modifying existing records", async () => {
    const connection = await pool.connect(),
      schema = `groups_upgrade_${run.replaceAll("-", "")}`;
    try {
      await connection.query(`CREATE SCHEMA ${schema}`);
      await connection.query(`SET search_path TO ${schema}`);
      await connection.query(
        "CREATE TABLE organization (id text PRIMARY KEY, name text); CREATE TABLE member (id text PRIMARY KEY, organization_id text); CREATE TABLE service (id text PRIMARY KEY, workspace_id text)",
      );
      await connection.query(
        "INSERT INTO organization VALUES ('old','Preserved'); INSERT INTO member VALUES ('member','old'); INSERT INTO service VALUES ('service','old')",
      );
      const migration = (
        await readFile("drizzle/0004_nosy_saracen.sql", "utf8")
      ).replaceAll('"public".', `"${schema}".`);
      await connection.query(migration);
      expect(
        (
          await connection.query(
            "SELECT name,is_default,version FROM workspace_group",
          )
        ).rows,
      ).toEqual([{ name: "Everyone", is_default: true, version: 1 }]);
      expect(
        (await connection.query("SELECT * FROM organization")).rows,
      ).toEqual([{ id: "old", name: "Preserved" }]);
      expect((await connection.query("SELECT * FROM member")).rowCount).toBe(1);
      expect((await connection.query("SELECT * FROM service")).rowCount).toBe(
        1,
      );
      expect(
        (await connection.query("SELECT * FROM service_access_group")).rowCount,
      ).toBe(0);
    } finally {
      await connection.query("SET search_path TO public");
      await connection.query(`DROP SCHEMA ${schema} CASCADE`);
      connection.release();
    }
  });
});
