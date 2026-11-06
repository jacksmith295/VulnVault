import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  finding,
  findingReference,
  findingSource,
  integrationRepository,
  organization,
  service,
  serviceRepository,
  workspaceIntegration,
} from "@/db/schema";
import { createGithubClient, GithubError } from "./github";
import type { DependabotAlert, GithubRepository } from "./types";
import {
  lockActiveService,
  lockAdmin,
  lockAutomationWorkspace,
  type Transaction,
} from "./internal";

const POLL_SECONDS = 15 * 60;
// The provider bounds its complete HTTP operation to 60 seconds.
const LEASE_SECONDS = 120;
type Mapping = typeof integrationRepository.$inferSelect;
type Integration = typeof workspaceIntegration.$inferSelect;
type Claim = {
  mapping: Mapping;
  integration: Integration;
  serviceVersion: number;
  token: string;
};
export type SyncResult = {
  status: "success" | "failed" | "busy" | "unavailable";
  imported?: number;
  error?: string;
};
type Human = { slug: string; userId: string };
const unavailable: SyncResult = {
  status: "unavailable",
  error: "Connection unavailable, disabled, or its service is archived.",
};
const busy: SyncResult = {
  status: "busy",
  error: "A sync is already running or GitHub retry backoff is active.",
};

async function claimMapping(
  id: string,
  human?: Human,
): Promise<Claim | SyncResult> {
  // This lookup chooses lock keys only. Every permission and configuration value is re-read under locks.
  const [candidate] = await db
    .select()
    .from(integrationRepository)
    .where(eq(integrationRepository.id, id));
  if (!candidate) return unavailable;
  return db.transaction(async (tx) => {
    const workspace = human
      ? await lockAdmin(tx, human.slug, human.userId)
      : await lockAutomationWorkspace(tx, candidate.workspaceId);
    if (!workspace || workspace.id !== candidate.workspaceId)
      return unavailable;
    const activeService = await lockActiveService(
      tx,
      workspace.id,
      candidate.serviceId,
    );
    if (!activeService) return unavailable;
    const [grant] = await tx
      .select()
      .from(workspaceIntegration)
      .where(
        and(
          eq(workspaceIntegration.id, candidate.integrationId),
          eq(workspaceIntegration.workspaceId, workspace.id),
        ),
      )
      .for("update");
    if (!grant?.enabled || process.env.GITHUB_APP_ID !== grant.appId)
      return unavailable;
    const [mapping] = await tx
      .select()
      .from(integrationRepository)
      .where(
        and(
          eq(integrationRepository.id, id),
          eq(integrationRepository.workspaceId, workspace.id),
        ),
      )
      .for("update");
    if (
      !mapping?.enabled ||
      mapping.integrationId !== grant.id ||
      mapping.serviceId !== activeService.id
    )
      return unavailable;
    const [link] = await tx
      .select()
      .from(serviceRepository)
      .where(
        and(
          eq(serviceRepository.id, mapping.repositoryLinkId),
          eq(serviceRepository.serviceId, activeService.id),
        ),
      );
    if (!link) return unavailable;
    const [clock] = await tx
      .select({ now: sql<Date>`clock_timestamp()` })
      .from(organization)
      .where(eq(organization.id, workspace.id));
    const now = new Date(clock.now);
    if (
      (grant.blockedUntil && grant.blockedUntil > now) ||
      (mapping.leaseExpiresAt && mapping.leaseExpiresAt > now) ||
      ((!human || mapping.errorCode !== null) && mapping.nextAttemptAt > now)
    )
      return busy;
    const token = randomUUID();
    await tx
      .update(integrationRepository)
      .set({
        leaseToken: token,
        leaseExpiresAt: sql`clock_timestamp() + interval '${sql.raw(String(LEASE_SECONDS))} seconds'`,
        lastAttemptAt: sql`clock_timestamp()`,
      })
      .where(eq(integrationRepository.id, id));
    return {
      mapping,
      integration: grant,
      serviceVersion: activeService.version,
      token,
    };
  });
}

async function lockClaim(tx: Transaction, claim: Claim) {
  const { mapping, integration } = claim;
  if (!(await lockAutomationWorkspace(tx, mapping.workspaceId))) return null;
  const activeService = await lockActiveService(
    tx,
    mapping.workspaceId,
    mapping.serviceId,
  );
  if (!activeService || activeService.version !== claim.serviceVersion)
    return null;
  const [grant] = await tx
    .select()
    .from(workspaceIntegration)
    .where(
      and(
        eq(workspaceIntegration.id, integration.id),
        eq(workspaceIntegration.workspaceId, mapping.workspaceId),
      ),
    )
    .for("update");
  if (
    !grant?.enabled ||
    grant.version !== integration.version ||
    grant.installationId !== integration.installationId ||
    process.env.GITHUB_APP_ID !== grant.appId
  )
    return null;
  const [current] = await tx
    .select()
    .from(integrationRepository)
    .where(
      and(
        eq(integrationRepository.id, mapping.id),
        eq(integrationRepository.workspaceId, mapping.workspaceId),
        eq(integrationRepository.integrationId, grant.id),
        eq(integrationRepository.serviceId, activeService.id),
        eq(integrationRepository.version, mapping.version),
        eq(integrationRepository.leaseToken, claim.token),
        sql`${integrationRepository.leaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .for("update");
  if (
    !current?.enabled ||
    current.repositoryId !== mapping.repositoryId ||
    current.repositoryLinkId !== mapping.repositoryLinkId
  )
    return null;
  const [link] = await tx
    .select()
    .from(serviceRepository)
    .where(
      and(
        eq(serviceRepository.id, mapping.repositoryLinkId),
        eq(serviceRepository.serviceId, mapping.serviceId),
      ),
    );
  return link ? current : null;
}
function sourceValues(claim: Claim, alert: DependabotAlert) {
  return {
    workspaceId: claim.mapping.workspaceId,
    serviceId: claim.mapping.serviceId,
    kind: "github_dependabot",
    repositoryId: claim.mapping.repositoryId,
    alertNumber: alert.number,
    state: alert.state,
    upstreamCreatedAt: new Date(alert.createdAt),
    upstreamUpdatedAt: new Date(alert.updatedAt),
    packageName: alert.packageName,
    ecosystem: alert.ecosystem,
    manifestPath: alert.manifestPath,
    ghsaId: alert.ghsaId,
    cveId: alert.cveId,
    vulnerableRange: alert.vulnerableRange,
    patchedVersion: alert.patchedVersion,
    summary: alert.summary,
    severity: alert.severity,
    url: alert.url,
    lastSeenAt: sql`now()`,
  };
}
async function commitSnapshot(
  claim: Claim,
  repository: GithubRepository,
  alerts: DependabotAlert[],
): Promise<SyncResult> {
  return db.transaction(async (tx) => {
    const current = await lockClaim(tx, claim);
    if (!current) return unavailable;
    let imported = 0;
    for (const alert of alerts) {
      const values = sourceValues(claim, alert);
      const [existing] = await tx
        .select()
        .from(findingSource)
        .where(
          and(
            eq(findingSource.serviceId, claim.mapping.serviceId),
            eq(findingSource.kind, "github_dependabot"),
            eq(findingSource.repositoryId, claim.mapping.repositoryId),
            eq(findingSource.alertNumber, alert.number),
          ),
        )
        .for("update");
      if (existing) {
        // Upstream refreshes deliberately never touch local finding fields or version.
        await tx
          .update(findingSource)
          .set(values)
          .where(
            and(
              eq(findingSource.findingId, existing.findingId),
              // Alias links have separate leases, so an older snapshot must not undo newer state.
              lte(findingSource.upstreamUpdatedAt, values.upstreamUpdatedAt),
            ),
          );
      } else if (alert.state === "open") {
        const findingId = randomUUID();
        await tx
          .insert(finding)
          .values({
            id: findingId,
            serviceId: claim.mapping.serviceId,
            title:
              alert.summary.trim().slice(0, 200) ||
              `Dependabot alert #${alert.number}`,
            description:
              alert.description.trim().slice(0, 20000) ||
              alert.summary.trim().slice(0, 20000) ||
              `Dependabot alert #${alert.number}`,
            severity: alert.severity,
            status: "new",
          });
        await tx
          .insert(findingReference)
          .values({ id: randomUUID(), findingId, url: alert.url });
        await tx.insert(findingSource).values({ findingId, ...values });
        imported++;
      }
    }
    // Recheck expiry at the final write as a snapshot can contain many alerts.
    const [finished] = await tx
      .update(integrationRepository)
      .set({
        fullName: repository.fullName,
        leaseToken: null,
        leaseExpiresAt: null,
        lastSuccessAt: sql`now()`,
        nextAttemptAt: sql`now() + interval '${sql.raw(String(POLL_SECONDS))} seconds'`,
        failures: 0,
        errorCode: null,
      })
      .where(
        and(
          eq(integrationRepository.id, claim.mapping.id),
          eq(integrationRepository.leaseToken, claim.token),
          eq(integrationRepository.version, claim.mapping.version),
          sql`${integrationRepository.leaseExpiresAt} > clock_timestamp()`,
        ),
      )
      .returning({ id: integrationRepository.id });
    if (!finished) throw new Error("expired-sync");
    return { status: "success", imported };
  });
}
async function recordFailure(
  claim: Claim,
  error: unknown,
): Promise<SyncResult> {
  const code = error instanceof GithubError ? error.code : "internal";
  const retryAt = error instanceof GithubError ? error.retryAt : undefined;
  await db.transaction(async (tx) => {
    const current = await lockClaim(tx, claim);
    if (!current) return;
    const seconds = Math.min(3600, 60 * 2 ** Math.min(current.failures, 6));
    const [finished] = await tx
      .update(integrationRepository)
      .set({
        leaseToken: null,
        leaseExpiresAt: null,
        errorCode: code,
        failures: current.failures + 1,
        nextAttemptAt: retryAt
          ? sql`greatest(now() + make_interval(secs => ${seconds}), ${retryAt})`
          : sql`now() + make_interval(secs => ${seconds})`,
      })
      .where(
        and(
          eq(integrationRepository.id, claim.mapping.id),
          eq(integrationRepository.leaseToken, claim.token),
          eq(integrationRepository.version, claim.mapping.version),
          sql`${integrationRepository.leaseExpiresAt} > clock_timestamp()`,
        ),
      )
      .returning({ id: integrationRepository.id });
    if (finished && retryAt)
      await tx
        .update(workspaceIntegration)
        .set({
          blockedUntil: sql`greatest(coalesce(${workspaceIntegration.blockedUntil}, now()), ${retryAt})`,
        })
        .where(eq(workspaceIntegration.id, claim.integration.id));
  });
  return {
    status: "failed",
    error:
      "GitHub sync failed. Check the connection status and retry after the indicated delay.",
  };
}
export async function syncMapping(
  id: string,
  human?: Human,
): Promise<SyncResult> {
  let claim: Claim | SyncResult;
  try {
    claim = await claimMapping(id, human);
  } catch {
    return {
      status: "failed",
      error: "Unable to start this sync. Please try again.",
    };
  }
  if ("status" in claim) return claim;
  try {
    const client = createGithubClient();
    const repository = await client.getRepository(
      claim.integration.installationId,
      { id: claim.mapping.repositoryId },
    );
    if (repository.id !== claim.mapping.repositoryId)
      throw new GithubError("invalid_response");
    const alerts = await client.listAlerts(
      claim.integration.installationId,
      repository,
    );
    return await commitSnapshot(claim, repository, alerts);
  } catch (error) {
    return recordFailure(claim, error);
  }
}
export async function runNextSync(
  workspaceSlug?: string,
): Promise<SyncResult | null> {
  const candidates = await db
    .select({ id: integrationRepository.id })
    .from(integrationRepository)
    .innerJoin(
      workspaceIntegration,
      eq(workspaceIntegration.id, integrationRepository.integrationId),
    )
    .innerJoin(service, eq(service.id, integrationRepository.serviceId))
    .innerJoin(
      organization,
      eq(organization.id, integrationRepository.workspaceId),
    )
    .where(
      and(
        eq(integrationRepository.enabled, true),
        eq(workspaceIntegration.enabled, true),
        isNull(service.archivedAt),
        lte(integrationRepository.nextAttemptAt, sql`now()`),
        or(
          isNull(integrationRepository.leaseExpiresAt),
          lte(integrationRepository.leaseExpiresAt, sql`now()`),
        ),
        or(
          isNull(workspaceIntegration.blockedUntil),
          lte(workspaceIntegration.blockedUntil, sql`now()`),
        ),
        workspaceSlug ? eq(organization.slug, workspaceSlug) : undefined,
      ),
    )
    .orderBy(
      asc(integrationRepository.nextAttemptAt),
      asc(integrationRepository.id),
    )
    .limit(10);
  for (const candidate of candidates) {
    const result = await syncMapping(candidate.id);
    if (result.status !== "busy" && result.status !== "unavailable")
      return result;
  }
  return null;
}
