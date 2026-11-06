import { authThrottlePool } from "@/lib/server/database";
import { resetAuthRateLimits } from "../helpers/auth-rate-limits";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const request = vi.hoisted(() => ({ headers: new Headers() }));
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
import { finding, member, organization, service, user } from "@/db/schema";
import {
  createFinding,
  editFinding,
  listFindings,
  requireFinding,
} from "@/features/findings/data";
import {
  createFindingSchema,
  editFindingSchema,
  findingFormInput,
} from "@/features/findings/validation";

const run = randomUUID();
const workspaceId = randomUUID();
const otherWorkspace = randomUUID();
const slug = `findings-${run}`;
const otherSlug = `other-findings-${run}`;
const serviceId = randomUUID();
const secondService = randomUUID();
const foreignService = randomUUID();
const membershipId = randomUUID();
let userId: string;
let cookie: string;
const input = {
  title: "CVE-2026-1234",
  description: "  A dependency vulnerability  ",
  severity: "high",
  remediationNotes: "",
  referenceUrls: [" HTTPS://Example.COM/Advisory/?a=1#Fix "],
};
const edit = { ...input, status: "triaged" };
function signedIn() {
  request.headers = new Headers({ cookie });
}
async function role(value: string) {
  await db
    .update(member)
    .set({ role: value })
    .where(eq(member.id, membershipId));
}
async function create(id = serviceId) {
  const result = await createFinding(slug, id, input);
  expect(result.error).toBeUndefined();
  return result.finding!;
}
beforeAll(async () => {
  await migrate(db, { migrationsFolder: "./drizzle" });
  await resetAuthRateLimits();
  const email = `findings-${run}@example.com`;
  const password = "Finding-password-123!";
  const headers = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
    "x-forwarded-for": `198.19.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 254) + 1}`,
  };
  const signup = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Finding tester", email, password }),
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
    .map((value) => value.split(";")[0])
    .join("; ");
  signedIn();
  await db.insert(organization).values([
    { id: workspaceId, slug, name: "Findings", createdAt: new Date() },
    {
      id: otherWorkspace,
      slug: otherSlug,
      name: "Other",
      createdAt: new Date(),
    },
  ]);
  await db.insert(member).values([
    {
      id: membershipId,
      userId,
      organizationId: workspaceId,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      userId,
      organizationId: otherWorkspace,
      role: "owner",
      createdAt: new Date(),
    },
  ]);
  await db.insert(service).values([
    { id: serviceId, workspaceId, name: "API" },
    { id: secondService, workspaceId, name: "Worker" },
    { id: foreignService, workspaceId: otherWorkspace, name: "Foreign" },
  ]);
});
afterAll(async () => {
  await db
    .delete(finding)
    .where(
      inArray(finding.serviceId, [serviceId, secondService, foreignService]),
    );
  await db
    .delete(service)
    .where(inArray(service.id, [serviceId, secondService, foreignService]));
  await db
    .delete(organization)
    .where(inArray(organization.id, [workspaceId, otherWorkspace]));
  if (userId) await db.delete(user).where(eq(user.id, userId));
  await authThrottlePool.end();
  await pool.end();
});

describe("manual findings with real sessions and PostgreSQL", () => {
  it("normalizes reference serialization without removing meaningful URL parts, validates limits and strict inputs", () => {
    expect(createFindingSchema.parse(input)).toMatchObject({
      description: "A dependency vulnerability",
      remediationNotes: null,
      referenceUrls: ["https://example.com/Advisory/?a=1#Fix"],
    });
    expect(
      createFindingSchema.parse({ ...input, referenceUrls: ["https://host"] })
        .referenceUrls,
    ).toEqual(["https://host/"]);
    expect(
      createFindingSchema.parse({
        ...input,
        referenceUrls: [
          "https://host/Case",
          "https://host/case",
          "https://host/Case/",
        ],
      }).referenceUrls,
    ).toHaveLength(3);
    for (const referenceUrls of [
      ["https://host", "HTTPS://HOST/"],
      ["https://user:pass@host/"],
      ["javascript:alert(1)"],
      ["https://host/" + "x".repeat(2048)],
      ["https://host/" + "é".repeat(400)],
      Array(21).fill("https://host/"),
    ])
      expect(
        createFindingSchema.safeParse({ ...input, referenceUrls }).success,
      ).toBe(false);
    for (const invalid of [
      { title: "x" },
      { title: "x".repeat(201) },
      { description: " " },
      { description: "x".repeat(20001) },
      { severity: "unknown" },
      { remediationNotes: "x".repeat(20001) },
      { status: "resolved" },
      { resolvedAt: new Date() },
      { serviceId: secondService },
      { createdBy: "actor" },
      { updatedBy: "actor" },
      { version: 1 },
      { workspaceId: otherWorkspace },
    ])
      expect(
        createFindingSchema.safeParse({ ...input, ...invalid }).success,
      ).toBe(false);
    expect(
      editFindingSchema.safeParse({ ...edit, serviceId: secondService })
        .success,
    ).toBe(false);
    const form = new FormData();
    form.set("title", input.title);
    form.set("description", input.description);
    form.set("severity", "high");
    form.set("remediationNotes", "");
    form.set(
      "referenceUrls",
      "https://host/?q=one#part\n\nhttps://other/Case/\n",
    );
    form.set("$ACTION_ID_123", "");
    expect(
      createFindingSchema.parse(findingFormInput(form)).referenceUrls,
    ).toEqual(["https://host/?q=one#part", "https://other/Case/"]);
    form.append("severity", "low");
    expect(findingFormInput(form)).toBeNull();
  });

  it("requires verified authentication for every read and mutation", async () => {
    for (const verified of [true, false]) {
      request.headers = verified ? new Headers() : new Headers({ cookie });
      if (!verified)
        await db
          .update(user)
          .set({ emailVerified: false })
          .where(eq(user.id, userId));
      try {
        await expect(listFindings(slug, serviceId)).rejects.toThrow(
          "redirect:/login",
        );
        await expect(
          requireFinding(slug, serviceId, "unknown"),
        ).rejects.toThrow("redirect:/login");
        await expect(createFinding(slug, serviceId, input)).rejects.toThrow(
          "redirect:/login",
        );
        await expect(
          editFinding(slug, serviceId, "unknown", 1, edit),
        ).rejects.toThrow("redirect:/login");
      } finally {
        await db
          .update(user)
          .set({ emailVerified: true })
          .where(eq(user.id, userId));
      }
    }
    signedIn();
  });

  it("allows owner/admin/member creation and updates but fails closed for unknown and revoked membership", async () => {
    for (const value of ["owner", "admin", "member"]) {
      await role(value);
      const created = await create();
      expect(created).toMatchObject({
        status: "new",
        version: 1,
        createdBy: userId,
        updatedBy: userId,
        resolvedAt: null,
      });
      expect(
        (await editFinding(slug, serviceId, created.id, 1, edit)).finding
          ?.version,
      ).toBe(2);
      expect(
        (await requireFinding(slug, serviceId, created.id)).finding.id,
      ).toBe(created.id);
    }
    await role("unknown");
    expect((await createFinding(slug, serviceId, input)).error).toBeTruthy();
    await expect(listFindings(slug, serviceId)).rejects.toThrow("not-found");
    await db.delete(member).where(eq(member.id, membershipId));
    expect((await createFinding(slug, serviceId, input)).error).toBeTruthy();
    expect(
      (await editFinding(slug, serviceId, "unknown", 1, edit)).error,
    ).toBeTruthy();
    await expect(requireFinding(slug, serviceId, "unknown")).rejects.toThrow(
      "not-found",
    );
    await db
      .insert(member)
      .values({
        id: membershipId,
        userId,
        organizationId: workspaceId,
        role: "owner",
        createdAt: new Date(),
      });
  });

  it("scopes workspace, service and finding together even for an owner of both workspaces", async () => {
    const created = await create();
    const before = await requireFinding(slug, serviceId, created.id);
    for (const [routeSlug, routeService] of [
      [slug, secondService],
      [otherSlug, foreignService],
      [otherSlug, serviceId],
      [slug, foreignService],
    ]) {
      await expect(
        requireFinding(routeSlug, routeService, created.id),
      ).rejects.toThrow("not-found");
      expect(
        (await editFinding(routeSlug, routeService, created.id, 1, edit)).error,
      ).toBeTruthy();
    }
    expect(await requireFinding(slug, serviceId, created.id)).toEqual(before);
    expect(
      (await createFinding(otherSlug, serviceId, input)).error,
    ).toBeTruthy();
    for (const forged of [
      { status: "resolved" },
      { serviceId: secondService },
      { resolvedAt: new Date() },
      { createdBy: "actor" },
      { updatedBy: "actor" },
    ])
      expect(
        (await createFinding(slug, serviceId, { ...input, ...forged })).error,
      ).toBeTruthy();
  });

  it("keeps per-service resolutions independent, preserves resolution dates until reopening and permits every status", async () => {
    let first = await create();
    const second = await create(secondService);
    first = (
      await editFinding(slug, serviceId, first.id, first.version, {
        ...edit,
        status: "resolved",
      })
    ).finding!;
    expect(first.resolvedAt).toBeInstanceOf(Date);
    const resolution = first.resolvedAt;
    first = (
      await editFinding(slug, serviceId, first.id, first.version, {
        ...edit,
        status: "resolved",
        remediationNotes: "Upgraded",
      })
    ).finding!;
    expect(first.resolvedAt).toEqual(resolution);
    expect(
      (await requireFinding(slug, secondService, second.id)).finding,
    ).toMatchObject({ status: "new", resolvedAt: null });
    for (const status of [
      "rejected",
      "accepted_risk",
      "in_progress",
      "triaged",
      "new",
    ]) {
      first = (
        await editFinding(slug, serviceId, first.id, first.version, {
          ...edit,
          status,
        })
      ).finding!;
      expect(first).toMatchObject({ status, resolvedAt: null });
    }
  });

  it("preserves reference IDs, rejects stale and concurrent edits without changing references", async () => {
    const created = await create();
    const original = await requireFinding(slug, serviceId, created.id);
    const urls = [original.references[0].url, "https://host/new"];
    const updated = await editFinding(slug, serviceId, created.id, 1, {
      ...edit,
      referenceUrls: urls,
    });
    expect(updated.finding?.version).toBe(2);
    expect(
      (await requireFinding(slug, serviceId, created.id)).references,
    ).toContainEqual(original.references[0]);
    expect(
      (
        await editFinding(slug, serviceId, created.id, 1, {
          ...edit,
          referenceUrls: [],
        })
      ).conflict,
    ).toBe(true);
    expect(
      (await requireFinding(slug, serviceId, created.id)).references,
    ).toHaveLength(2);
    for (const version of [0, 1.5, NaN, 2147483647])
      expect(
        (await editFinding(slug, serviceId, created.id, version, edit))
          .conflict,
      ).toBe(true);
    const results = await Promise.all([
      editFinding(slug, serviceId, created.id, 2, { ...edit, title: "First" }),
      editFinding(slug, serviceId, created.id, 2, { ...edit, title: "Second" }),
    ]);
    expect(results.filter((result) => result.finding)).toHaveLength(1);
    expect(results.filter((result) => result.conflict)).toHaveLength(1);
  });

  it("keeps archived findings readable and denies all roles until restore", async () => {
    const created = await create();
    await db
      .update(service)
      .set({ archivedAt: new Date() })
      .where(eq(service.id, serviceId));
    try {
      for (const value of ["owner", "admin", "member"]) {
        await role(value);
        expect(
          (await requireFinding(slug, serviceId, created.id)).finding.id,
        ).toBe(created.id);
        expect(
          (await listFindings(slug, serviceId)).findings.some(
            (row) => row.id === created.id,
          ),
        ).toBe(true);
        expect(
          (await createFinding(slug, serviceId, input)).error,
        ).toBeTruthy();
        expect(
          (await editFinding(slug, serviceId, created.id, 1, edit)).error,
        ).toBeTruthy();
      }
    } finally {
      await db
        .update(service)
        .set({ archivedAt: null })
        .where(eq(service.id, serviceId));
      await role("owner");
    }
    expect(
      (await editFinding(slug, serviceId, created.id, 1, edit)).finding
        ?.version,
    ).toBe(2);
  });

  it("rolls back finding and reference writes if reference persistence fails", async () => {
    const created = await create();
    const before = await requireFinding(slug, serviceId, created.id);
    const trigger = `finding_test_${run.replaceAll("-", "")}`;
    const failureUrl = `https://host/${run}`;
    await pool.query(
      `CREATE FUNCTION ${trigger}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.url = '${failureUrl}' THEN RAISE EXCEPTION 'fixture reference failure'; END IF; RETURN NEW; END $$`,
    );
    await pool.query(
      `CREATE TRIGGER ${trigger} BEFORE INSERT ON finding_reference FOR EACH ROW EXECUTE FUNCTION ${trigger}()`,
    );
    try {
      expect(
        (
          await createFinding(slug, serviceId, {
            ...input,
            title: run,
            referenceUrls: [failureUrl],
          })
        ).error,
      ).toContain("Unable to create");
      expect(
        await db.select().from(finding).where(eq(finding.title, run)),
      ).toHaveLength(0);
      expect(
        (
          await editFinding(slug, serviceId, created.id, 1, {
            ...edit,
            title: "Failed edit",
            referenceUrls: [failureUrl],
          })
        ).error,
      ).toContain("Unable to save");
      expect(await requireFinding(slug, serviceId, created.id)).toEqual(before);
    } finally {
      await pool.query(`DROP TRIGGER ${trigger} ON finding_reference`);
      await pool.query(`DROP FUNCTION ${trigger}()`);
    }
  });

  it("enforces database enum/version checks, service restriction and nullable actor ownership", async () => {
    const created = await create();
    for (const invalid of [
      { severity: "unknown" },
      { status: "unknown" },
      { version: 0 },
    ]) {
      await expect(
        db.update(finding).set(invalid).where(eq(finding.id, created.id)),
      ).rejects.toThrow();
    }
    await expect(
      db.delete(service).where(eq(service.id, serviceId)),
    ).rejects.toThrow();
    const actorId = randomUUID();
    await db
      .insert(user)
      .values({
        id: actorId,
        name: "Temporary actor",
        email: `actor-${actorId}@example.com`,
        emailVerified: true,
      });
    await db
      .update(finding)
      .set({ createdBy: actorId, updatedBy: actorId })
      .where(eq(finding.id, created.id));
    await db.delete(user).where(eq(user.id, actorId));
    expect(
      (await requireFinding(slug, serviceId, created.id)).finding,
    ).toMatchObject({ createdBy: null, updatedBy: null });
  });

  it("holds membership and service share locks until commit so revocation and archival wait", async () => {
    for (const change of ["revoke", "archive"]) {
      const created = await create();
      const blocker = await pool.connect();
      const changer = await pool.connect();
      let mutation: ReturnType<typeof editFinding> | undefined;
      let changed: Promise<unknown> | undefined;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM finding WHERE id = $1 FOR UPDATE", [
          created.id,
        ]);
        mutation = editFinding(slug, serviceId, created.id, 1, {
          ...edit,
          title: "Serialized finding",
        });
        let waiting = false;
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
          await blocker.query("SELECT pg_stat_clear_snapshot()");
          const result = await blocker.query(
            "SELECT 1 FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND query LIKE 'select%from \"finding\"%for update%' AND pid <> pg_backend_pid()",
          );
          if (result.rowCount) {
            waiting = true;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
        expect(waiting).toBe(true);
        let complete = false;
        changed =
          change === "revoke"
            ? changer.query("DELETE FROM member WHERE id = $1", [membershipId])
            : changer.query(
                "UPDATE service SET archived_at = NOW() WHERE id = $1",
                [serviceId],
              );
        void changed.then(() => {
          complete = true;
        });
        await new Promise((resolve) => setTimeout(resolve, 100));
        expect(complete).toBe(false);
        await blocker.query("COMMIT");
        expect((await mutation).finding?.title).toBe("Serialized finding");
        await changed;
        expect(
          (await editFinding(slug, serviceId, created.id, 2, edit)).error,
        ).toBeTruthy();
      } finally {
        await blocker.query("ROLLBACK");
        await mutation;
        await changed;
        blocker.release();
        changer.release();
        if (change === "revoke")
          await db
            .insert(member)
            .values({
              id: membershipId,
              userId,
              organizationId: workspaceId,
              role: "owner",
              createdAt: new Date(),
            })
            .onConflictDoNothing();
        await db
          .update(service)
          .set({ archivedAt: null })
          .where(eq(service.id, serviceId));
      }
    }
  });
});

// Authentication uses one local bucket, so each test starts with a fresh budget.
beforeEach(resetAuthRateLimits);
