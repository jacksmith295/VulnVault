import { authThrottlePool } from "@/lib/server/database";
import { resetAuthRateLimits } from "../helpers/auth-rate-limits";
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
import {
  finding,
  member,
  organization,
  service,
  user,
  workspaceGroup,
  groupMembership,
  serviceAccessGroup,
} from "@/db/schema";
import {
  changeFindingStatus,
  createFinding,
  requireFinding,
} from "@/features/findings/data";

import {
  getFindingBoard,
  getFindingBoardFilterOptions,
  getMoreBoardFindings,
} from "@/features/findings/board-data";
import { parseBoardFilters } from "@/features/findings/board-validation";
const everyone = randomUUID();
const allowedGroup = randomUUID();
const hiddenGroup = randomUUID();
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
  await db.insert(workspaceGroup).values([
    { id: everyone, workspaceId, name: "Everyone", isDefault: true },
    { id: allowedGroup, workspaceId, name: "Allowed" },
    { id: hiddenGroup, workspaceId, name: "Hidden" },
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

beforeEach(async () => {
  await resetAuthRateLimits();
  signedIn();
  await role("owner");
  await db
    .delete(finding)
    .where(
      inArray(finding.serviceId, [serviceId, secondService, foreignService]),
    );
  await db
    .delete(serviceAccessGroup)
    .where(eq(serviceAccessGroup.workspaceId, workspaceId));
  await db
    .delete(groupMembership)
    .where(eq(groupMembership.workspaceId, workspaceId));
  await db
    .update(service)
    .set({ archivedAt: null })
    .where(eq(service.id, serviceId));
});
const total = (board: Awaited<ReturnType<typeof getFindingBoard>>) =>
  board.columns.reduce((sum, column) => sum + column.total, 0);

describe("workspace findings board with PostgreSQL and real sessions", () => {
  it("rejects invalid, duplicate, forged and unavailable filters without widening results", async () => {
    await create();
    for (const filters of [
      { severity: ["high", "low"] },
      { status: "invalid" },
      { archive: "invalid" },
      { group: hiddenGroup + "x" },
      { service: foreignService },
      { extra: "x" },
    ]) {
      const board = await getFindingBoard(slug, filters);
      expect(board.filterError).toBeTruthy();
      expect(total(board)).toBe(0);
    }
    expect(parseBoardFilters({ archive: "", severity: "" })).toEqual({
      filters: { archive: "active" },
    });
    expect(parseBoardFilters({ bogus: "" }).error).toBeTruthy();
    expect(
      parseBoardFilters(JSON.parse('{"__proto__":{"archive":"all"}}')).error,
    ).toBeTruthy();
    expect(total(await getFindingBoard(slug, {}))).toBe(1);
  });

  it("keeps counts, cards, options and group filtering within service access for every role", async () => {
    await create();
    await create(secondService);
    await db.insert(serviceAccessGroup).values({
      workspaceId,
      serviceId: secondService,
      groupId: hiddenGroup,
    });
    await db.insert(groupMembership).values({
      workspaceId,
      groupId: allowedGroup,
      memberId: membershipId,
    });
    for (const value of ["owner", "admin", "member"]) {
      await role(value);
      const board = await getFindingBoard(slug, {});
      const options = await getFindingBoardFilterOptions(slug, {});
      expect(options.services).toEqual(board.services);
      expect(options.groups).toEqual(board.groups);
      expect(options.services.some((row) => row.id === foreignService)).toBe(
        false,
      );
      expect(total(board)).toBe(value === "member" ? 1 : 2);
      expect(board.services.map((row) => row.id)).toEqual(
        expect.arrayContaining([serviceId]),
      );
      expect(board.groups.some((row) => row.id === hiddenGroup)).toBe(
        value !== "member",
      );
      expect(total(await getFindingBoard(slug, { group: everyone }))).toBe(1);
      expect(total(await getFindingBoard(slug, { group: allowedGroup }))).toBe(
        0,
      );
    }
    const hidden = await getFindingBoard(slug, { service: secondService });
    expect(hidden.filterError).toBeTruthy();
    expect(hidden.services.some((row) => row.id === secondService)).toBe(false);
    await role("unknown");
    await expect(getFindingBoardFilterOptions(slug, {})).rejects.toThrow(
      "not-found",
    );
    await expect(getFindingBoard(slug, {})).rejects.toThrow("not-found");
  });

  it("requires verified sessions and membership for board reads, pagination and status changes", async () => {
    for (const verified of [true, false]) {
      request.headers = verified ? new Headers() : new Headers({ cookie });
      if (!verified)
        await db
          .update(user)
          .set({ emailVerified: false })
          .where(eq(user.id, userId));
      try {
        await expect(getFindingBoardFilterOptions(slug, {})).rejects.toThrow(
          "redirect:/login",
        );
        await expect(getFindingBoard(slug, {})).rejects.toThrow(
          "redirect:/login",
        );
        await expect(
          getMoreBoardFindings(slug, {}, "new", "x", "x"),
        ).rejects.toThrow("redirect:/login");
        await expect(
          changeFindingStatus(slug, serviceId, "x", 1, "resolved"),
        ).rejects.toThrow("redirect:/login");
      } finally {
        await db
          .update(user)
          .set({ emailVerified: true })
          .where(eq(user.id, userId));
      }
    }
    signedIn();
    await db.delete(member).where(eq(member.id, membershipId));
    try {
      await expect(getFindingBoardFilterOptions(slug, {})).rejects.toThrow(
        "not-found",
      );
      await expect(getFindingBoard(slug, {})).rejects.toThrow("not-found");
      expect(await getMoreBoardFindings(slug, {}, "new", "x", "x")).toEqual({
        reset: true,
      });
    } finally {
      await db.insert(member).values({
        id: membershipId,
        userId,
        organizationId: workspaceId,
        role: "owner",
        createdAt: new Date(),
      });
    }
  });

  it("paginates independent columns with exact microsecond ordering and a mutable anchor", async () => {
    const ids = Array.from({ length: 43 }, () => randomUUID());
    await db.insert(finding).values(
      ids.map((id, index) => ({
        id,
        serviceId,
        title: `Finding ${index}`,
        description: "Evidence",
        severity: index % 2 ? "high" : "low",
        status: "new",
      })),
    );
    for (let index = 0; index < ids.length; index++)
      await pool.query(
        "UPDATE finding SET created_at = '2026-01-01 00:00:00'::timestamp + ($1::integer * interval '1 microsecond') WHERE id = $2",
        [Math.min(index, 41), ids[index]],
      );
    const ordered = [
      ...ids.slice(41).sort().reverse(),
      ...ids.slice(0, 41).reverse(),
    ];
    const triaged = await create();
    await changeFindingStatus(slug, serviceId, triaged.id, 1, "triaged");
    const board = await getFindingBoard(slug, {});
    const first = board.columns.find((row) => row.status === "new")!;
    expect(first.total).toBe(43);
    expect(first.findings.map((row) => row.id)).toEqual(ordered.slice(0, 20));
    expect(board.columns.find((row) => row.status === "triaged")?.total).toBe(
      1,
    );
    const refreshed = await getFindingBoard(slug, {});
    expect(refreshed.revisionKey).not.toBe(board.revisionKey);
    expect(refreshed.scopeKey).toBe(board.scopeKey);
    await changeFindingStatus(
      slug,
      serviceId,
      first.nextCursor!,
      1,
      "resolved",
    );
    const second = await getMoreBoardFindings(
      slug,
      {},
      "new",
      first.nextCursor,
      board.scopeKey,
    );
    expect(second.reset).toBe(false);
    if (second.reset) throw new Error("Unexpected reset");
    expect(second.findings.map((row) => row.id)).toEqual(ordered.slice(20, 40));
    const third = await getMoreBoardFindings(
      slug,
      {},
      "new",
      second.nextCursor,
      board.scopeKey,
    );
    if (third.reset) throw new Error("Unexpected reset");
    expect(third.findings.map((row) => row.id)).toEqual(ordered.slice(40));
    expect(third.nextCursor).toBeNull();
    expect(
      await getMoreBoardFindings(
        slug,
        {},
        "new",
        foreignService,
        board.scopeKey,
      ),
    ).toEqual({ reset: true });
    expect(
      total(await getFindingBoard(slug, { severity: "high", status: "new" })),
    ).toBe(20);
  });

  it("clears accumulated cards when service access changes between pages", async () => {
    const created = await create();
    await create(secondService);
    await role("member");
    const board = await getFindingBoard(slug, {});
    await db.insert(serviceAccessGroup).values({
      workspaceId,
      serviceId: secondService,
      groupId: hiddenGroup,
    });
    expect(
      await getMoreBoardFindings(slug, {}, "new", created.id, board.scopeKey),
    ).toEqual({ reset: true });
    expect(total(await getFindingBoard(slug, {}))).toBe(1);
  });

  it("applies archive filters and keeps archived cards read only", async () => {
    const created = await create();
    await create(secondService);
    await db
      .update(service)
      .set({ archivedAt: new Date() })
      .where(eq(service.id, serviceId));
    expect(total(await getFindingBoard(slug, {}))).toBe(1);
    const archived = await getFindingBoard(slug, { archive: "archived" });
    expect(total(archived)).toBe(1);
    expect(archived.columns[0].findings[0].archived).toBe(true);
    expect(total(await getFindingBoard(slug, { archive: "all" }))).toBe(2);
    expect(
      (await changeFindingStatus(slug, serviceId, created.id, 1, "resolved"))
        .error,
    ).toBeTruthy();
  });

  it("updates only status lifecycle fields, preserves references and notes, and rejects concurrent stale updates", async () => {
    for (const value of ["owner", "admin", "member"]) {
      await role(value);
      const created = (
        await createFinding(slug, serviceId, {
          ...input,
          remediationNotes: "Keep these notes",
        })
      ).finding!;
      const original = await requireFinding(slug, serviceId, created.id);
      const resolved = (
        await changeFindingStatus(slug, serviceId, created.id, 1, "resolved")
      ).finding!;
      expect(resolved.resolvedAt).toBeInstanceOf(Date);
      const repeated = (
        await changeFindingStatus(slug, serviceId, created.id, 2, "resolved")
      ).finding!;
      expect(repeated.resolvedAt).toEqual(resolved.resolvedAt);
      const results = await Promise.all([
        changeFindingStatus(slug, serviceId, created.id, 3, "new"),
        changeFindingStatus(slug, serviceId, created.id, 3, "triaged"),
      ]);
      expect(results.filter((row) => row.finding)).toHaveLength(1);
      expect(results.filter((row) => row.conflict)).toHaveLength(1);
      const after = await requireFinding(slug, serviceId, created.id);
      expect(after.references).toEqual(original.references);
      expect(after.finding).toMatchObject({
        title: original.finding.title,
        description: original.finding.description,
        remediationNotes: "Keep these notes",
        severity: "high",
        resolvedAt: null,
        version: 4,
      });
      expect(
        (
          await changeFindingStatus(
            slug,
            secondService,
            created.id,
            4,
            "resolved",
          )
        ).error,
      ).toBeTruthy();
      expect(
        (
          await changeFindingStatus(
            otherSlug,
            serviceId,
            created.id,
            4,
            "resolved",
          )
        ).error,
      ).toBeTruthy();
      expect(
        (
          await changeFindingStatus(slug, serviceId, created.id, 4, {
            status: "resolved",
          })
        ).error,
      ).toBeTruthy();
    }
  });
  it("holds membership and service share locks until commit so revocation and archival wait", async () => {
    for (const change of ["revoke", "archive"]) {
      const created = await create();
      const blocker = await pool.connect();
      const changer = await pool.connect();
      let mutation: ReturnType<typeof changeFindingStatus> | undefined;
      let changed: Promise<unknown> | undefined;
      try {
        await blocker.query("BEGIN");
        await blocker.query("SELECT id FROM finding WHERE id = $1 FOR UPDATE", [
          created.id,
        ]);
        mutation = changeFindingStatus(
          slug,
          serviceId,
          created.id,
          1,
          "triaged",
        );
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
        expect((await mutation).finding?.status).toBe("triaged");
        await changed;
        expect(
          (
            await changeFindingStatus(
              slug,
              serviceId,
              created.id,
              2,
              "resolved",
            )
          ).error,
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
