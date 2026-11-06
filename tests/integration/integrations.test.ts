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
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { resetAuthRateLimits } from "../helpers/auth-rate-limits";

const request = vi.hoisted(() => ({ headers: new Headers() }));
const upstream = vi.hoisted(() => ({
  getRepository: vi.fn(),
  listAlerts: vi.fn(),
}));
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
vi.mock("@/features/integrations/github", async (original) => ({
  ...(await original<typeof import("@/features/integrations/github")>()),
  createGithubClient: () => upstream,
}));
vi.mock("@/features/integrations/config", () => ({
  readGithubConfig: () => ({ appId: "123", privateKey: "test-only" }),
}));
import { db, pool } from "@/db";
import { authThrottlePool } from "@/lib/server/database";
import { auth } from "@/lib/auth";
import {
  finding,
  findingReference,
  findingSource,
  integrationRepository,
  member,
  organization,
  service,
  serviceRepository,
  serviceAccessGroup,
  workspaceGroup,
  user,
  workspaceIntegration,
} from "@/db/schema";
import {
  connectRepository,
  getIntegrationPageData,
  setIntegrationEnabled,
  setRepositoryEnabled,
  syncRepositoryNow,
} from "@/features/integrations/data";
import { provisionGithubIntegration } from "@/features/integrations/operator";
import { runNextSync } from "@/features/integrations/sync";
import { requireFinding } from "@/features/findings/data";
import {
  GithubError,
  type DependabotAlert,
} from "@/features/integrations/types";

const run = randomUUID();
const workspaceId = randomUUID(),
  otherWorkspace = randomUUID(),
  serviceId = randomUUID(),
  foreignService = randomUUID(),
  linkId = randomUUID(),
  foreignLink = randomUUID(),
  membershipId = randomUUID();
const slug = `integrations-${run}`,
  otherSlug = `foreign-integrations-${run}`;
const installation = {
  id: String(Math.floor(Math.random() * 1e12) + 1),
  appId: "123",
  accountId: String(Math.floor(Math.random() * 1e12) + 1),
  accountLogin: "example",
  accountType: "Organization" as const,
};
const repository = {
  id: "200",
  fullName: "example/repo",
  url: "https://github.com/example/repo",
};
let userId: string, cookie: string, integrationId: string, mappingId: string;
function alert(
  number = 1,
  changes: Partial<DependabotAlert> = {},
): DependabotAlert {
  return {
    number,
    state: "open",
    summary: "Vulnerable dependency",
    description: "Upgrade this dependency.",
    severity: "high",
    packageName: "example",
    ecosystem: "npm",
    manifestPath: "package.json",
    ghsaId: "GHSA-aaaa-bbbb-cccc",
    cveId: "CVE-2026-1234",
    vulnerableRange: "< 2",
    patchedVersion: "2",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-02T00:00:00Z",
    url: `https://github.com/example/repo/security/dependabot/${number}`,
    ...changes,
  };
}
async function mapping() {
  return (
    await db
      .select()
      .from(integrationRepository)
      .where(eq(integrationRepository.id, mappingId))
  )[0];
}
async function grant() {
  return (
    await db
      .select()
      .from(workspaceIntegration)
      .where(eq(workspaceIntegration.id, integrationId))
  )[0];
}
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
async function blockedSync() {
  const entered = deferred(),
    release = deferred();
  upstream.listAlerts.mockImplementationOnce(async () => {
    entered.resolve();
    await release.promise;
    return [alert()];
  });
  const pending = syncRepositoryNow(slug, mappingId);
  await entered.promise;
  return { pending, release };
}
async function seed() {
  const result = await provisionGithubIntegration(
    slug,
    installation,
    repository,
  );
  expect("ok" in result).toBe(true);
  if (!("ok" in result)) throw new Error(result.error);
  integrationId = result.integrationId!;
  mappingId = (
    await db
      .select()
      .from(integrationRepository)
      .where(eq(integrationRepository.integrationId, integrationId))
  )[0].id;
}
beforeAll(async () => {
  process.env.GITHUB_APP_ID = "123";
  await migrate(db, { migrationsFolder: "./drizzle" });
  await resetAuthRateLimits();
  const email = `integrations-${run}@example.com`,
    password = "Integration-password-123!";
  const headers = {
    origin: "http://localhost:3000",
    "content-type": "application/json",
  };
  const signup = await auth.handler(
    new Request("http://localhost:3000/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: "Integration tester", email, password }),
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
  await db.insert(organization).values([
    { id: workspaceId, slug, name: "Integrations", createdAt: new Date() },
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
      organizationId: workspaceId,
      userId,
      role: "owner",
      createdAt: new Date(),
    },
    {
      id: randomUUID(),
      organizationId: otherWorkspace,
      userId,
      role: "owner",
      createdAt: new Date(),
    },
  ]);
  await db.insert(service).values([
    { id: serviceId, workspaceId, name: "API" },
    { id: foreignService, workspaceId: otherWorkspace, name: "Other" },
  ]);
  await db.insert(serviceRepository).values([
    { id: linkId, serviceId, url: repository.url },
    { id: foreignLink, serviceId: foreignService, url: repository.url },
  ]);
});
beforeEach(async () => {
  await resetAuthRateLimits();
  request.headers = new Headers({ cookie });
  upstream.getRepository.mockReset().mockResolvedValue(repository);
  upstream.listAlerts.mockReset().mockResolvedValue([alert()]);
  await db
    .delete(integrationRepository)
    .where(eq(integrationRepository.workspaceId, workspaceId));
  await db.delete(finding).where(eq(finding.serviceId, serviceId));
  await db
    .delete(workspaceIntegration)
    .where(eq(workspaceIntegration.workspaceId, workspaceId));
  await db
    .update(member)
    .set({ role: "owner" })
    .where(eq(member.id, membershipId));
  await db
    .update(service)
    .set({ archivedAt: null, version: 1 })
    .where(eq(service.id, serviceId));
  await db
    .delete(serviceRepository)
    .where(eq(serviceRepository.serviceId, serviceId));
  await db
    .insert(serviceRepository)
    .values({ id: linkId, serviceId, url: repository.url });
  await seed();
});
afterAll(async () => {
  await db
    .delete(integrationRepository)
    .where(
      inArray(integrationRepository.workspaceId, [workspaceId, otherWorkspace]),
    );
  await db
    .delete(finding)
    .where(inArray(finding.serviceId, [serviceId, foreignService]));
  await db
    .delete(workspaceIntegration)
    .where(
      inArray(workspaceIntegration.workspaceId, [workspaceId, otherWorkspace]),
    );
  await db
    .delete(service)
    .where(inArray(service.id, [serviceId, foreignService]));
  await db
    .delete(organization)
    .where(inArray(organization.id, [workspaceId, otherWorkspace]));
  if (userId) await db.delete(user).where(eq(user.id, userId));
  await authThrottlePool.end();
  await pool.end();
});

describe("Dependabot tenant isolation and fenced persistence", () => {
  it("requires verified sessions and owner/admin role for every browser management operation", async () => {
    const operations = () => [
      () => getIntegrationPageData(slug),
      () => connectRepository(slug, integrationId, linkId),
      () => setIntegrationEnabled(slug, integrationId, 1, false),
      () => setRepositoryEnabled(slug, mappingId, 1, false),
      () => syncRepositoryNow(slug, mappingId),
    ];
    for (const verified of [true, false]) {
      request.headers = verified ? new Headers() : new Headers({ cookie });
      if (!verified)
        await db
          .update(user)
          .set({ emailVerified: false })
          .where(eq(user.id, userId));
      try {
        for (const operation of operations())
          await expect(operation()).rejects.toThrow("redirect:/login");
      } finally {
        await db
          .update(user)
          .set({ emailVerified: true })
          .where(eq(user.id, userId));
      }
    }
    request.headers = new Headers({ cookie });
    for (const role of ["member", "unknown"]) {
      await db.update(member).set({ role }).where(eq(member.id, membershipId));
      await expect(getIntegrationPageData(slug)).rejects.toThrow("not-found");
      expect(
        await setIntegrationEnabled(slug, integrationId, 1, false),
      ).toHaveProperty("error");
      expect((await syncRepositoryNow(slug, mappingId)).status).toBe(
        "unavailable",
      );
    }
    expect(upstream.listAlerts).not.toHaveBeenCalled();
  });
  it("binds installations once, preserves stable identity on replacement and prevents cross-workspace relationships", async () => {
    expect(
      await provisionGithubIntegration(otherSlug, installation, repository),
    ).toHaveProperty("error");
    expect(
      await provisionGithubIntegration(
        slug,
        { ...installation, appId: "456" },
        repository,
      ),
    ).toHaveProperty("error");
    const first = await grant();
    expect(
      await provisionGithubIntegration(
        slug,
        { ...installation, id: `${installation.id}1` },
        repository,
      ),
    ).toMatchObject({ ok: true, integrationId });
    expect((await grant()).version).toBe(first.version + 1);
    expect(
      await connectRepository(otherSlug, integrationId, foreignLink),
    ).toHaveProperty("error");
    await expect(
      db
        .insert(integrationRepository)
        .values({
          id: randomUUID(),
          workspaceId,
          integrationId,
          serviceId: foreignService,
          repositoryLinkId: foreignLink,
          repositoryId: "200",
          fullName: repository.fullName,
        }),
    ).rejects.toThrow();
    const page = await getIntegrationPageData(slug);
    expect(page.integrations[0].repositories[0]).not.toHaveProperty(
      "leaseToken",
    );
    expect(page.repositories.map((row) => row.id)).toEqual([linkId]);
  });
  it("imports only unseen open alerts, refreshes all source states and preserves every local field and reference", async () => {
    upstream.listAlerts.mockResolvedValue([
      alert(),
      alert(2, { state: "fixed" }),
      alert(3, { state: "dismissed" }),
      alert(4, { state: "auto_dismissed" }),
    ]);
    expect(await syncRepositoryNow(slug, mappingId)).toMatchObject({
      status: "success",
      imported: 1,
    });
    const [created] = await db
      .select()
      .from(finding)
      .where(eq(finding.serviceId, serviceId));
    expect(created).toMatchObject({
      status: "new",
      severity: "high",
      version: 1,
      createdBy: null,
    });
    await db
      .update(finding)
      .set({
        title: "Local title",
        description: "Local description",
        severity: "low",
        status: "resolved",
        remediationNotes: "Local notes",
        resolvedAt: new Date("2026-03-01"),
        version: 5,
      })
      .where(eq(finding.id, created.id));
    await db
      .delete(findingReference)
      .where(eq(findingReference.findingId, created.id));
    const [local] = await db
      .select()
      .from(finding)
      .where(eq(finding.id, created.id));
    for (const state of [
      "open",
      "fixed",
      "dismissed",
      "auto_dismissed",
    ] as const) {
      upstream.listAlerts.mockResolvedValue([
        alert(1, { state, summary: "Upstream changed", severity: "critical" }),
      ]);
      expect((await syncRepositoryNow(slug, mappingId)).status).toBe("success");
      expect(
        (await db.select().from(finding).where(eq(finding.id, created.id)))[0],
      ).toEqual(local);
      const detail = await requireFinding(slug, serviceId, created.id);
      expect(detail.source).toMatchObject({
        state,
        summary: "Upstream changed",
        severity: "critical",
      });
      expect(detail.references).toEqual([]);
    }
    upstream.listAlerts.mockResolvedValue([]);
    await syncRepositoryNow(slug, mappingId);
    expect(
      await db
        .select()
        .from(findingSource)
        .where(eq(findingSource.findingId, created.id)),
    ).toHaveLength(1);
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
  });
  it("serializes repeated/concurrent sync and rejects stale configuration versions", async () => {
    const blocked = await blockedSync();
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("busy");
    expect(
      await setRepositoryEnabled(slug, mappingId, 999, false),
    ).toMatchObject({ conflict: true });
    blocked.release.resolve();
    expect((await blocked.pending).status).toBe("success");
    expect((await syncRepositoryNow(slug, mappingId)).imported).toBe(0);
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
  });
  it("keeps newer upstream state when an older alias-mapping snapshot commits last", async () => {
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("success");
    const aliasId = randomUUID();
    await db
      .insert(serviceRepository)
      .values({ id: aliasId, serviceId, url: `${repository.url}.git` });
    const alias = await connectRepository(slug, integrationId, aliasId);
    if (!("ok" in alias)) throw new Error("alias connection failed");
    const old = await blockedSync();
    upstream.listAlerts.mockResolvedValueOnce([
      alert(1, {
        state: "fixed",
        summary: "Newer advisory",
        updatedAt: "2026-02-01T00:00:00Z",
      }),
    ]);
    expect((await syncRepositoryNow(slug, alias.mappingId!)).status).toBe(
      "success",
    );
    old.release.resolve();
    expect((await old.pending).status).toBe("success");
    const [source] = await db
      .select()
      .from(findingSource)
      .where(eq(findingSource.serviceId, serviceId));
    expect(source).toMatchObject({
      state: "fixed",
      summary: "Newer advisory",
      upstreamUpdatedAt: new Date("2026-02-01T00:00:00Z"),
    });
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
  });
  it("fences expired workers against a replacement lease without clearing its token", async () => {
    const old = await blockedSync();
    await db
      .update(integrationRepository)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(integrationRepository.id, mappingId));
    const fresh = await blockedSync();
    const newToken = (await mapping()).leaseToken;
    old.release.resolve();
    expect((await old.pending).status).toBe("unavailable");
    expect((await mapping()).leaseToken).toBe(newToken);
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(0);
    fresh.release.resolve();
    expect((await fresh.pending).status).toBe("success");
  });
  it("prevents a stale failed worker from changing a newer lease, retry state or installation backoff", async () => {
    const entered = deferred(),
      release = deferred();
    upstream.listAlerts.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
      throw new GithubError("rate_limited", new Date(Date.now() + 600000));
    });
    const old = syncRepositoryNow(slug, mappingId);
    await entered.promise;
    await db
      .update(integrationRepository)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(integrationRepository.id, mappingId));
    const fresh = await blockedSync();
    const before = await mapping();
    release.resolve();
    expect((await old).status).toBe("failed");
    expect(await mapping()).toEqual(before);
    expect((await grant()).blockedUntil).toBeNull();
    fresh.release.resolve();
    expect((await fresh.pending).status).toBe("success");
  });
  it("fences disconnect, mapping disable and archive/restore during network I/O", async () => {
    for (const change of ["disconnect", "mapping", "archive"]) {
      const blocked = await blockedSync();
      if (change === "disconnect") {
        const g = await grant();
        await setIntegrationEnabled(slug, integrationId, g.version, false);
        await setIntegrationEnabled(slug, integrationId, g.version + 1, true);
      }
      if (change === "mapping") {
        const m = await mapping();
        await setRepositoryEnabled(slug, mappingId, m.version, false);
        await setRepositoryEnabled(slug, mappingId, m.version + 1, true);
      }
      if (change === "archive") {
        await db
          .update(service)
          .set({ archivedAt: new Date(), version: 2 })
          .where(eq(service.id, serviceId));
        await db
          .update(service)
          .set({ archivedAt: null, version: 3 })
          .where(eq(service.id, serviceId));
      }
      blocked.release.resolve();
      expect((await blocked.pending).status).toBe("unavailable");
      expect(
        await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
      ).toHaveLength(0);
      await db
        .update(integrationRepository)
        .set({ leaseToken: null, leaseExpiresAt: null })
        .where(eq(integrationRepository.id, mappingId));
    }
  });
  it("retains provenance across repository removal/re-add, supports rename by immutable ID and fails identity mismatch", async () => {
    await syncRepositoryNow(slug, mappingId);
    const pending = await blockedSync();
    await db.delete(serviceRepository).where(eq(serviceRepository.id, linkId));
    pending.release.resolve();
    expect((await pending.pending).status).toBe("unavailable");
    expect(
      await db
        .select()
        .from(integrationRepository)
        .where(eq(integrationRepository.id, mappingId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(findingSource)
        .where(eq(findingSource.serviceId, serviceId)),
    ).toHaveLength(1);
    await db
      .insert(serviceRepository)
      .values({ id: linkId, serviceId, url: repository.url });
    await seed();
    upstream.getRepository.mockResolvedValue({
      ...repository,
      fullName: "example/renamed",
      url: "https://github.com/example/renamed",
    });
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("success");
    expect((await mapping()).fullName).toBe("example/renamed");
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
    upstream.getRepository.mockResolvedValue({ ...repository, id: "201" });
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("failed");
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
  });
  it("keeps complete snapshots atomic on fetch/persistence failure and applies installation-wide provider backoff", async () => {
    const secondLink = randomUUID();
    await db
      .insert(serviceRepository)
      .values({ id: secondLink, serviceId, url: `${repository.url}.git` });
    const secondConnection = await connectRepository(
      slug,
      integrationId,
      secondLink,
    );
    expect(secondConnection).toHaveProperty("ok", true);
    if (!("ok" in secondConnection)) throw new Error("connection failed");
    upstream.listAlerts.mockRejectedValueOnce(
      new GithubError("invalid_response"),
    );
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("failed");
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("busy");
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(0);
    // The second invalid alert fails the DB constraint after the first finding was inserted.
    await db
      .update(integrationRepository)
      .set({ nextAttemptAt: sql`now()` })
      .where(eq(integrationRepository.id, mappingId));
    upstream.listAlerts.mockResolvedValueOnce([
      alert(),
      alert(2, { severity: "invalid" as "high" }),
    ]);
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("failed");
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(0);
    await db
      .update(integrationRepository)
      .set({ nextAttemptAt: sql`now()` })
      .where(eq(integrationRepository.id, mappingId));
    upstream.listAlerts.mockRejectedValueOnce(
      new GithubError("rate_limited", new Date(Date.now() + 600_000)),
    );
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("failed");
    const calls = upstream.listAlerts.mock.calls.length;
    expect((await syncRepositoryNow(slug, mappingId)).status).toBe("busy");
    expect(upstream.listAlerts.mock.calls.length).toBe(calls);
    expect(
      (await syncRepositoryNow(slug, secondConnection.mappingId!)).status,
    ).toBe("busy");
    expect(upstream.listAlerts.mock.calls.length).toBe(calls);
    expect(await runNextSync(slug)).toBeNull();
    expect((await grant()).blockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect((await mapping()).errorCode).toBe("rate_limited");
  });
  it("preserves the automation grant after the enabling admin loses membership and prevents cross-tenant provenance", async () => {
    await db
      .update(member)
      .set({ role: "member" })
      .where(eq(member.id, membershipId));
    expect((await runNextSync(slug))?.status).toBe("success");
    const [source] = await db
      .select()
      .from(findingSource)
      .where(eq(findingSource.serviceId, serviceId));
    await expect(
      db
        .update(findingSource)
        .set({ workspaceId: otherWorkspace })
        .where(eq(findingSource.findingId, source.findingId)),
    ).rejects.toThrow();
    await expect(
      requireFinding(otherSlug, foreignService, source.findingId),
    ).rejects.toThrow("not-found");
    expect(
      (await requireFinding(slug, serviceId, source.findingId)).source
        ?.findingId,
    ).toBe(source.findingId);
    const groupId = randomUUID();
    await db
      .insert(workspaceGroup)
      .values({ id: groupId, workspaceId, name: `Restricted ${run}` });
    await db
      .insert(serviceAccessGroup)
      .values({ workspaceId, serviceId, groupId });
    try {
      await expect(
        requireFinding(slug, serviceId, source.findingId),
      ).rejects.toThrow("not-found");
    } finally {
      await db
        .delete(serviceAccessGroup)
        .where(eq(serviceAccessGroup.serviceId, serviceId));
      await db.delete(workspaceGroup).where(eq(workspaceGroup.id, groupId));
    }
  });
});
