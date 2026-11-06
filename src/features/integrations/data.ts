import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  integrationRepository,
  service,
  serviceRepository,
  workspaceIntegration,
} from "@/db/schema";
import { requireSession } from "@/lib/auth-session";
import { requireWorkspace } from "@/features/workspaces/data";
import { versionSchema } from "@/features/services/validation";
import { createGithubClient, parseGithubRepositoryUrl } from "./github";
import type { GithubRepository } from "./types";
import {
  changed,
  lockActiveService,
  lockAdmin,
  unavailable,
  validId,
  invalidateMappings,
} from "./internal";
import { syncMapping } from "./sync";

export type IntegrationResult =
  | {
      ok: true;
      integrationId?: string;
      mappingId?: string;
      mappedRepositories?: number;
    }
  | { error: string; conflict?: boolean };

export async function getIntegrationPageData(slug: string) {
  const workspace = await requireWorkspace(slug, ["owner", "admin"]);
  const integrations = await db
    .select()
    .from(workspaceIntegration)
    .where(eq(workspaceIntegration.workspaceId, workspace.id))
    .orderBy(asc(workspaceIntegration.accountLogin));
  const mappings = await db
    .select({
      mapping: integrationRepository,
      serviceName: service.name,
      repositoryUrl: serviceRepository.url,
      archivedAt: service.archivedAt,
    })
    .from(integrationRepository)
    .innerJoin(service, eq(service.id, integrationRepository.serviceId))
    .innerJoin(
      serviceRepository,
      eq(serviceRepository.id, integrationRepository.repositoryLinkId),
    )
    .where(eq(integrationRepository.workspaceId, workspace.id))
    .orderBy(asc(service.name), asc(integrationRepository.fullName));
  const repositories = (
    await db
      .select({
        id: serviceRepository.id,
        serviceId: service.id,
        serviceName: service.name,
        url: serviceRepository.url,
      })
      .from(serviceRepository)
      .innerJoin(service, eq(service.id, serviceRepository.serviceId))
      .where(
        and(eq(service.workspaceId, workspace.id), isNull(service.archivedAt)),
      )
  ).filter((row) => parseGithubRepositoryUrl(row.url));
  return {
    workspace,
    integrations: integrations.map((integration) => ({
      ...integration,
      repositories: mappings
        .filter((row) => row.mapping.integrationId === integration.id)
        .map(({ mapping, ...details }) => {
          const { leaseToken: _leaseToken, ...safeMapping } = mapping;
          void _leaseToken;
          return { ...safeMapping, ...details };
        }),
    })),
    repositories,
  };
}

export async function setIntegrationEnabled(
  slug: string,
  id: string,
  version: number,
  enabled: boolean,
): Promise<IntegrationResult> {
  const { user } = await requireSession();
  if (
    !validId(id) ||
    !versionSchema.safeParse(version).success ||
    typeof enabled !== "boolean"
  )
    return changed;
  return db.transaction(async (tx) => {
    const workspace = await lockAdmin(tx, slug, user.id, true);
    if (!workspace) return unavailable;
    const [updated] = await tx
      .update(workspaceIntegration)
      .set({ enabled, version: sql`${workspaceIntegration.version} + 1` })
      .where(
        and(
          eq(workspaceIntegration.id, id),
          eq(workspaceIntegration.workspaceId, workspace.id),
          eq(workspaceIntegration.version, version),
        ),
      )
      .returning();
    if (!updated) return changed;
    await invalidateMappings(tx, id);
    return { ok: true, integrationId: id };
  });
}
export async function setRepositoryEnabled(
  slug: string,
  id: string,
  version: number,
  enabled: boolean,
): Promise<IntegrationResult> {
  const { user } = await requireSession();
  if (
    !validId(id) ||
    !versionSchema.safeParse(version).success ||
    typeof enabled !== "boolean"
  )
    return changed;
  return db.transaction(async (tx) => {
    const workspace = await lockAdmin(tx, slug, user.id, true);
    if (!workspace) return unavailable;
    const [candidate] = await tx
      .select()
      .from(integrationRepository)
      .where(
        and(
          eq(integrationRepository.id, id),
          eq(integrationRepository.workspaceId, workspace.id),
        ),
      );
    if (!candidate) return unavailable;
    // Follow the same service, integration, mapping lock order used by workers.
    await tx
      .select({ id: service.id })
      .from(service)
      .where(
        and(
          eq(service.id, candidate.serviceId),
          eq(service.workspaceId, workspace.id),
        ),
      )
      .for("share");
    await tx
      .select({ id: workspaceIntegration.id })
      .from(workspaceIntegration)
      .where(
        and(
          eq(workspaceIntegration.id, candidate.integrationId),
          eq(workspaceIntegration.workspaceId, workspace.id),
        ),
      )
      .for("update");
    const [updated] = await tx
      .update(integrationRepository)
      .set({
        enabled,
        version: sql`${integrationRepository.version} + 1`,
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: sql`now()`,
      })
      .where(
        and(
          eq(integrationRepository.id, id),
          eq(integrationRepository.workspaceId, workspace.id),
          eq(integrationRepository.version, version),
        ),
      )
      .returning();
    return updated ? { ok: true, mappingId: id } : changed;
  });
}
export async function connectRepository(
  slug: string,
  integrationId: string,
  repositoryLinkId: string,
): Promise<IntegrationResult> {
  const { user } = await requireSession();
  if (!validId(integrationId) || !validId(repositoryLinkId)) return unavailable;
  const workspace = await requireWorkspace(slug, ["owner", "admin"]);
  const [grant] = await db
    .select()
    .from(workspaceIntegration)
    .where(
      and(
        eq(workspaceIntegration.id, integrationId),
        eq(workspaceIntegration.workspaceId, workspace.id),
      ),
    );
  const [link] = await db
    .select({ repository: serviceRepository, serviceId: service.id })
    .from(serviceRepository)
    .innerJoin(service, eq(service.id, serviceRepository.serviceId))
    .where(
      and(
        eq(service.workspaceId, workspace.id),
        eq(serviceRepository.id, repositoryLinkId),
        isNull(service.archivedAt),
      ),
    );
  const fullName = link && parseGithubRepositoryUrl(link.repository.url);
  if (
    !grant ||
    !grant.enabled ||
    !fullName ||
    process.env.GITHUB_APP_ID !== grant.appId
  )
    return unavailable;
  let repository: GithubRepository;
  try {
    repository = await createGithubClient().getRepository(
      grant.installationId,
      { fullName },
    );
  } catch {
    return {
      error:
        "GitHub repository access could not be verified. Check the App installation and try again.",
    };
  }
  try {
    return await db.transaction(async (tx) => {
      const currentWorkspace = await lockAdmin(tx, slug, user.id, true);
      if (
        !currentWorkspace ||
        currentWorkspace.id !== workspace.id ||
        !(await lockActiveService(tx, workspace.id, link.serviceId))
      )
        return unavailable;
      const [currentGrant] = await tx
        .select()
        .from(workspaceIntegration)
        .where(
          and(
            eq(workspaceIntegration.id, grant.id),
            eq(workspaceIntegration.workspaceId, workspace.id),
          ),
        )
        .for("update");
      const [currentLink] = await tx
        .select()
        .from(serviceRepository)
        .where(
          and(
            eq(serviceRepository.id, repositoryLinkId),
            eq(serviceRepository.serviceId, link.serviceId),
          ),
        );
      if (
        !currentGrant?.enabled ||
        currentGrant.version !== grant.version ||
        process.env.GITHUB_APP_ID !== currentGrant.appId ||
        currentLink?.url !== link.repository.url
      )
        return changed;
      const [existing] = await tx
        .select()
        .from(integrationRepository)
        .where(eq(integrationRepository.repositoryLinkId, repositoryLinkId));
      if (existing)
        return { error: "This repository link is already connected." };
      const id = randomUUID();
      await tx
        .insert(integrationRepository)
        .values({
          id,
          workspaceId: workspace.id,
          integrationId: grant.id,
          serviceId: link.serviceId,
          repositoryLinkId,
          repositoryId: repository.id,
          fullName: repository.fullName,
        });
      return { ok: true, mappingId: id };
    });
  } catch {
    return {
      error: "Unable to connect this repository. Reload and try again.",
    };
  }
}
export async function syncRepositoryNow(slug: string, mappingId: string) {
  const { user } = await requireSession();
  if (!validId(mappingId))
    return { status: "unavailable" as const, error: unavailable.error };
  return syncMapping(mappingId, { slug, userId: user.id });
}
