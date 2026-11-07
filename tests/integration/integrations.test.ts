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
  getServiceIntegrationPageData,
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
  siblingService = randomUUID(),
  siblingLink = randomUUID(),
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
  const pending = syncRepositoryNow(slug, serviceId, mappingId);
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
    { id: siblingService, workspaceId, name: "Sibling API" },
    { id: foreignService, workspaceId: otherWorkspace, name: "Other" },
  ]);
  await db.insert(serviceRepository).values([
    { id: linkId, serviceId, url: repository.url },
    { id: siblingLink, serviceId: siblingService, url: "https://github.com/example/sibling" },
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
    .where(inArray(finding.serviceId, [serviceId, siblingService, foreignService]));
  await db
    .delete(workspaceIntegration)
    .where(
      inArray(workspaceIntegration.workspaceId, [workspaceId, otherWorkspace]),
    );
  await db
    .delete(service)
    .where(inArray(service.id, [serviceId, siblingService, foreignService]));
  await db
    .delete(organization)
    .where(inArray(organization.id, [workspaceId, otherWorkspace]));
  if (userId) await db.delete(user).where(eq(user.id, userId));
  await authThrottlePool.end();
  await pool.end();
});

describe("Dependabot tenant isolation and fenced persistence", () => {
  it.each([
    ["integration", "statement"],
    ["integration", "commit"],
    ["repository", "statement"],
    ["repository", "commit"],
  ])("returns a safe error and rolls back %s changes on %s failure", async (target, failure) => {
    await db
      .update(integrationRepository)
      .set({
        leaseToken: randomUUID(),
        leaseExpiresAt: new Date(Date.now() + 120_000),
      })
      .where(eq(integrationRepository.id, mappingId));
    const beforeGrant = await grant();
    const beforeMapping = await mapping();
    const identifier = `integration_failure_${randomUUID().replaceAll("-", "")}`;
    const diagnostics = vi.spyOn(console, "error").mockImplementation(() => {});
    // Fail after the write, including at COMMIT, so the production transaction must roll back.
    await pool.query(`CREATE FUNCTION ${identifier}() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'private evidence token secret-credentials https://private.example/tenant'; END;
    $$`);
    try {
      await pool.query(`CREATE ${failure === "commit" ? "CONSTRAINT " : ""}TRIGGER ${identifier}
        AFTER UPDATE ON integration_repository
        ${failure === "commit" ? "DEFERRABLE INITIALLY DEFERRED" : ""}
        FOR EACH ROW WHEN (NEW.id = '${mappingId}') EXECUTE FUNCTION ${identifier}()`);
      const result =
        target === "integration"
          ? await setIntegrationEnabled(
              slug, integrationId, beforeGrant.version, false,
            )
          : await setRepositoryEnabled(
              slug, serviceId, mappingId, beforeMapping.version, false,
            );
      expect(result).toEqual({
        error: "Unable to update this connection. Reload and try again.",
      });
      expect(diagnostics.mock.calls).toEqual([[
        "[VulnVault] operation failed",
        { operation: target === "integration" ? "integration.toggle" : "integration.repository-toggle", category: "unknown" },
      ]]);
      expect(await grant()).toEqual(beforeGrant);
      expect(await mapping()).toEqual(beforeMapping);
    } finally {
      diagnostics.mockRestore();
      await pool.query(
        `DROP TRIGGER IF EXISTS ${identifier} ON integration_repository`,
      );
      await pool.query(`DROP FUNCTION ${identifier}()`);
    }
  });
  it("polls the current App even with ten older due mappings for a previous App", async () => {
    const previousGrant = randomUUID();
    const previousLinks = Array.from({ length: 10 }, () => randomUUID());
    await db.insert(workspaceIntegration).values({
      id: previousGrant,
      workspaceId,
      appId: "999",
      installationId: String(Math.floor(Math.random() * 1e12) + 1),
      accountId: String(Math.floor(Math.random() * 1e12) + 1),
      accountLogin: "previous-account",
      accountType: "Organization",
    });
    try {
      await db.insert(serviceRepository).values(
        previousLinks.map((id, index) => ({
          id,
          serviceId,
          url: `https://github.com/previous/repository-${index}`,
        })),
      );
      await db.insert(integrationRepository).values(
        previousLinks.map((id, index) => ({
          id: randomUUID(),
          workspaceId,
          integrationId: previousGrant,
          serviceId,
          repositoryLinkId: id,
          repositoryId: String(1000 + index),
          fullName: `previous/repository-${index}`,
          nextAttemptAt: new Date(Date.now() - 86_400_000),
        })),
      );
      upstream.getRepository.mockClear();
      upstream.listAlerts.mockClear();
      expect(await runNextSync(slug)).toMatchObject({
        status: "success", imported: 1,
      });
      expect(upstream.getRepository).toHaveBeenCalledExactlyOnceWith(
        installation.id, { id: repository.id },
      );
      expect(upstream.listAlerts).toHaveBeenCalledTimes(1);
      expect((await mapping()).lastSuccessAt).not.toBeNull();
      const previous = await db
        .select()
        .from(integrationRepository)
        .where(eq(integrationRepository.integrationId, previousGrant));
      expect(previous).toHaveLength(10);
      expect(previous.every(
        (row) => row.lastAttemptAt === null && row.leaseToken === null,
      )).toBe(true);
    } finally {
      await db.delete(integrationRepository)
        .where(eq(integrationRepository.integrationId, previousGrant));
      await db.delete(workspaceIntegration)
        .where(eq(workspaceIntegration.id, previousGrant));
      await db.delete(serviceRepository)
        .where(inArray(serviceRepository.id, previousLinks));
    }
  });
  it("requires verified sessions and owner/admin role for every browser management operation", async () => {
    const operations = () => [
      () => getIntegrationPageData(slug),
      () => getServiceIntegrationPageData(slug, serviceId),
      () => connectRepository(slug, serviceId, integrationId, linkId),
      () => setIntegrationEnabled(slug, integrationId, 1, false),
      () => setRepositoryEnabled(slug, serviceId, mappingId, 1, false),
      () => syncRepositoryNow(slug, serviceId, mappingId),
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
      await expect(getServiceIntegrationPageData(slug, serviceId)).rejects.toThrow("not-found");
      await expect(connectRepository(slug, serviceId, integrationId, linkId)).rejects.toThrow("not-found");
      expect(await setRepositoryEnabled(slug, serviceId, mappingId, 1, false)).toHaveProperty("error");
      expect(
        await setIntegrationEnabled(slug, integrationId, 1, false),
      ).toHaveProperty("error");
      expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe(
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
      await connectRepository(otherSlug, foreignService, integrationId, foreignLink),
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
    const page = await getServiceIntegrationPageData(slug, serviceId);
    expect(page.integrations[0].repositories[0]).not.toHaveProperty(
      "leaseToken",
    );
    expect(page.repositories.map((row) => row.id)).toEqual([linkId]);
  });
  it.each(["owner", "admin"])("allows %s service management and preserves archived toggle behaviour", async (role) => {
    await db.update(member).set({ role }).where(eq(member.id, membershipId));
    const extraLink = randomUUID();
    await db.insert(serviceRepository).values({ id: extraLink, serviceId, url: `${repository.url}.git` });
    expect(await connectRepository(slug, serviceId, integrationId, extraLink)).toHaveProperty("ok", true);
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("success");
    await db.update(service).set({ archivedAt: new Date() }).where(eq(service.id, serviceId));
    expect(await setRepositoryEnabled(slug, serviceId, mappingId, 1, false)).toHaveProperty("ok", true);
    upstream.getRepository.mockClear();
    expect(await connectRepository(slug, serviceId, integrationId, extraLink)).toHaveProperty("error");
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("unavailable");
    expect(upstream.getRepository).not.toHaveBeenCalled();
  });
  it("rejects forged service identifiers before provider access and keeps sibling mappings out of the read model", async () => {
    const result = await connectRepository(slug, siblingService, integrationId, siblingLink);
    if (!("ok" in result)) throw new Error("sibling connection failed");
    upstream.getRepository.mockClear();
    for (const target of [siblingService, foreignService, "missing-service"]) {
      expect(await connectRepository(slug, target, integrationId, linkId)).toHaveProperty("error");
      expect(await setRepositoryEnabled(slug, target, mappingId, 1, false)).toHaveProperty("error");
      expect((await syncRepositoryNow(slug, target, mappingId)).status).toBe("unavailable");
    }
    expect(await connectRepository(slug, serviceId, integrationId, siblingLink)).toHaveProperty("error");
    expect(await setRepositoryEnabled(slug, serviceId, result.mappingId!, 1, false)).toHaveProperty("error");
    expect((await syncRepositoryNow(slug, serviceId, result.mappingId!)).status).toBe("unavailable");
    expect((await syncRepositoryNow(otherSlug, serviceId, mappingId)).status).toBe("unavailable");
    expect(await setRepositoryEnabled(otherSlug, serviceId, mappingId, 1, false)).toHaveProperty("error");
    await expect(getServiceIntegrationPageData(otherSlug, serviceId)).rejects.toThrow("not-found");
    await expect(getServiceIntegrationPageData(slug, foreignService)).rejects.toThrow("not-found");
    const page = await getServiceIntegrationPageData(slug, serviceId);
    expect(page.repositories.map((row) => row.id)).toEqual([linkId]);
    expect(page.integrations[0].repositories.map((row) => row.id)).toEqual([mappingId]);
    expect(page.integrations[0].repositories[0]).not.toHaveProperty("leaseToken");
    expect(page.integrations[0].currentApp).toBe(true);
    const workspacePage = await getIntegrationPageData(slug);
    expect(workspacePage).not.toHaveProperty("repositories");
    expect(workspacePage.integrations[0]).not.toHaveProperty("repositories");
    expect(upstream.getRepository).not.toHaveBeenCalled();
    expect(upstream.listAlerts).not.toHaveBeenCalled();
  });
  it("retains disabled and previous App status plus all service URL choices in the scoped read model", async () => {
    await db.update(workspaceIntegration).set({ appId: "previous-app", enabled: false }).where(eq(workspaceIntegration.id, integrationId));
    const nonGithubLink = randomUUID();
    await db.insert(serviceRepository).values({ id: nonGithubLink, serviceId, url: "https://gitlab.com/example/project" });
    await db.update(integrationRepository).set({ errorCode: "not_found", lastSuccessAt: new Date("2026-01-01") }).where(eq(integrationRepository.id, mappingId));
    const page = await getServiceIntegrationPageData(slug, serviceId);
    expect(page.repositories.map((row) => row.id)).toContain(nonGithubLink);
    expect(page.integrations[0]).toMatchObject({ currentApp: false, enabled: false });
    expect(page.integrations[0].repositories[0]).toMatchObject({ id: mappingId, errorCode: "not_found", lastSuccessAt: new Date("2026-01-01") });
  });
  it.each(["link-service", "installation"])("rechecks %s after provider verification before connecting", async (change) => {
    const extraLink = randomUUID();
    await db.insert(serviceRepository).values({ id: extraLink, serviceId, url: `${repository.url}.git` });
    upstream.getRepository.mockImplementationOnce(async () => {
      if (change === "link-service") {
        await db.update(serviceRepository).set({ serviceId: siblingService }).where(eq(serviceRepository.id, extraLink));
      } else {
        await db.update(workspaceIntegration).set({ installationId: `${installation.id}9` }).where(eq(workspaceIntegration.id, integrationId));
      }
      return repository;
    });
    try {
      expect(await connectRepository(slug, serviceId, integrationId, extraLink)).toHaveProperty("error");
      expect(await db.select().from(integrationRepository).where(eq(integrationRepository.repositoryLinkId, extraLink))).toHaveLength(0);
    } finally {
      await db.delete(serviceRepository).where(eq(serviceRepository.id, extraLink));
    }
  });
  it.each([undefined, null, 1, ""])("rejects invalid service input %s", async (input) => {
    const invalid = input as unknown as string;
    expect(await connectRepository(slug, invalid, integrationId, linkId)).toHaveProperty("error");
    expect(await setRepositoryEnabled(slug, invalid, mappingId, 1, false)).toHaveProperty("error");
    expect((await syncRepositoryNow(slug, invalid, mappingId)).status).toBe("unavailable");
    await expect(getServiceIntegrationPageData(slug, invalid)).rejects.toThrow("not-found");
    expect(upstream.getRepository).not.toHaveBeenCalled();
    request.headers = new Headers();
    await expect(connectRepository(slug, invalid, integrationId, linkId)).rejects.toThrow("redirect:/login");
    await expect(setRepositoryEnabled(slug, invalid, mappingId, 1, false)).rejects.toThrow("redirect:/login");
    await expect(syncRepositoryNow(slug, invalid, mappingId)).rejects.toThrow("redirect:/login");
  });
  it("imports only unseen open alerts, refreshes all source states and preserves every local field and reference", async () => {
    upstream.listAlerts.mockResolvedValue([
      alert(),
      alert(2, { state: "fixed" }),
      alert(3, { state: "dismissed" }),
      alert(4, { state: "auto_dismissed" }),
    ]);
    expect(await syncRepositoryNow(slug, serviceId, mappingId)).toMatchObject({
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
      expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("success");
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
    await syncRepositoryNow(slug, serviceId, mappingId);
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
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("busy");
    expect(
      await setRepositoryEnabled(slug, serviceId, mappingId, 999, false),
    ).toMatchObject({ conflict: true });
    blocked.release.resolve();
    expect((await blocked.pending).status).toBe("success");
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).imported).toBe(0);
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
  });
  it("keeps newer upstream state when an older alias-mapping snapshot commits last", async () => {
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("success");
    const aliasId = randomUUID();
    await db
      .insert(serviceRepository)
      .values({ id: aliasId, serviceId, url: `${repository.url}.git` });
    const alias = await connectRepository(slug, serviceId, integrationId, aliasId);
    if (!("ok" in alias)) throw new Error("alias connection failed");
    const old = await blockedSync();
    upstream.listAlerts.mockResolvedValueOnce([
      alert(1, {
        state: "fixed",
        summary: "Newer advisory",
        updatedAt: "2026-02-01T00:00:00Z",
      }),
    ]);
    expect((await syncRepositoryNow(slug, serviceId, alias.mappingId!)).status).toBe(
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
    const old = syncRepositoryNow(slug, serviceId, mappingId);
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
        await setRepositoryEnabled(slug, serviceId, mappingId, m.version, false);
        await setRepositoryEnabled(slug, serviceId, mappingId, m.version + 1, true);
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
    await syncRepositoryNow(slug, serviceId, mappingId);
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
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("success");
    expect((await mapping()).fullName).toBe("example/renamed");
    expect(
      await db.select().from(finding).where(eq(finding.serviceId, serviceId)),
    ).toHaveLength(1);
    upstream.getRepository.mockResolvedValue({ ...repository, id: "201" });
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("failed");
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
      slug, serviceId,
      integrationId,
      secondLink,
    );
    expect(secondConnection).toHaveProperty("ok", true);
    if (!("ok" in secondConnection)) throw new Error("connection failed");
    upstream.listAlerts.mockRejectedValueOnce(
      new GithubError("invalid_response"),
    );
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("failed");
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("busy");
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
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("failed");
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
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("failed");
    const calls = upstream.listAlerts.mock.calls.length;
    expect((await syncRepositoryNow(slug, serviceId, mappingId)).status).toBe("busy");
    expect(upstream.listAlerts.mock.calls.length).toBe(calls);
    expect(
      (await syncRepositoryNow(slug, serviceId, secondConnection.mappingId!)).status,
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
