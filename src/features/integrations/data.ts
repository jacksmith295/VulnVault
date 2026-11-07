import "server-only";
import { reportDatabaseFailure } from "@/lib/server/diagnostics";
import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { notFound } from "next/navigation";
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

// Explicit projections keep credentials and lease ownership out of browser props.
const connectionProjection = {
  id: workspaceIntegration.id,
  provider: workspaceIntegration.provider,
  appId: workspaceIntegration.appId,
  installationId: workspaceIntegration.installationId,
  accountLogin: workspaceIntegration.accountLogin,
  accountType: workspaceIntegration.accountType,
  enabled: workspaceIntegration.enabled,
  version: workspaceIntegration.version,
  blockedUntil: workspaceIntegration.blockedUntil,
};
const mappingProjection = {
  id: integrationRepository.id,
  integrationId: integrationRepository.integrationId,
  serviceId: integrationRepository.serviceId,
  repositoryLinkId: integrationRepository.repositoryLinkId,
  repositoryId: integrationRepository.repositoryId,
  fullName: integrationRepository.fullName,
  enabled: integrationRepository.enabled,
  version: integrationRepository.version,
  nextAttemptAt: integrationRepository.nextAttemptAt,
  lastAttemptAt: integrationRepository.lastAttemptAt,
  lastSuccessAt: integrationRepository.lastSuccessAt,
  errorCode: integrationRepository.errorCode,
  failures: integrationRepository.failures,
  leaseExpiresAt: integrationRepository.leaseExpiresAt,
};

export async function getIntegrationPageData(slug: string) {
  const workspace = await requireWorkspace(slug, ["owner", "admin"]);
  const integrations = await db
    .select(connectionProjection)
    .from(workspaceIntegration)
    .where(eq(workspaceIntegration.workspaceId, workspace.id))
    .orderBy(asc(workspaceIntegration.accountLogin));
  return { workspace, integrations };
}
export type IntegrationPageData = Awaited<
  ReturnType<typeof getIntegrationPageData>
>;

export async function getServiceIntegrationPageData(
  slug: string,
  serviceId: string,
) {
  const workspace = await requireWorkspace(slug, ["owner", "admin"]);
  if (!validId(serviceId)) notFound();
  return db.transaction(
    async (tx) => {
      const [found] = await tx
        .select({
          id: service.id,
          name: service.name,
          description: service.description,
          archivedAt: service.archivedAt,
          createdAt: service.createdAt,
          updatedAt: service.updatedAt,
          version: service.version,
        })
        .from(service)
        .where(
          and(eq(service.id, serviceId), eq(service.workspaceId, workspace.id)),
        );
      if (!found) notFound();
      const integrations = await tx
        .select(connectionProjection)
        .from(workspaceIntegration)
        .where(eq(workspaceIntegration.workspaceId, workspace.id))
        .orderBy(asc(workspaceIntegration.accountLogin));
      const mappings = await tx
        .select({
          ...mappingProjection,
          serviceName: service.name,
          repositoryUrl: serviceRepository.url,
          archivedAt: service.archivedAt,
        })
        .from(integrationRepository)
        .innerJoin(service, eq(service.id, integrationRepository.serviceId))
        .innerJoin(
          serviceRepository,
          and(
            eq(serviceRepository.id, integrationRepository.repositoryLinkId),
            eq(serviceRepository.serviceId, service.id),
          ),
        )
        .where(
          and(
            eq(integrationRepository.workspaceId, workspace.id),
            eq(integrationRepository.serviceId, serviceId),
            eq(service.workspaceId, workspace.id),
          ),
        )
        .orderBy(asc(integrationRepository.fullName));
      const repositories = await tx
        .select({
          id: serviceRepository.id,
          serviceId: service.id,
          serviceName: service.name,
          url: serviceRepository.url,
        })
        .from(serviceRepository)
        .innerJoin(service, eq(service.id, serviceRepository.serviceId))
        .where(
          and(eq(service.id, serviceId), eq(service.workspaceId, workspace.id)),
        )
        .orderBy(asc(serviceRepository.url));
      return {
        workspace,
        service: found,
        repositories,
        integrations: integrations.map((integration) => ({
          ...integration,
          currentApp: integration.appId === process.env.GITHUB_APP_ID,
          repositories: mappings.filter(
            (mapping) => mapping.integrationId === integration.id,
          ),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type ServiceIntegrationPageData = Awaited<
  ReturnType<typeof getServiceIntegrationPageData>
>;

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
  try {
    return await db.transaction(async (tx) => {
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
  } catch (error) {
    reportDatabaseFailure("integration.toggle", error);
    return { error: "Unable to update this connection. Reload and try again." };
  }
}
export async function setRepositoryEnabled(
  slug: string,
  serviceId: string,
  id: string,
  version: number,
  enabled: boolean,
): Promise<IntegrationResult> {
  const { user } = await requireSession();
  if (
    !validId(serviceId) ||
    !validId(id) ||
    !versionSchema.safeParse(version).success ||
    typeof enabled !== "boolean"
  )
    return changed;
  try {
    return await db.transaction(async (tx) => {
      const workspace = await lockAdmin(tx, slug, user.id, true);
      if (!workspace) return unavailable;
      const [candidate] = await tx
        .select()
        .from(integrationRepository)
        .where(
          and(
            eq(integrationRepository.id, id),
            eq(integrationRepository.serviceId, serviceId),
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
            eq(service.id, serviceId),
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
            eq(integrationRepository.serviceId, serviceId),
            eq(integrationRepository.workspaceId, workspace.id),
            eq(integrationRepository.version, version),
          ),
        )
        .returning();
      return updated ? { ok: true, mappingId: id } : changed;
    });
  } catch (error) {
    reportDatabaseFailure("integration.repository-toggle", error);
    return { error: "Unable to update this connection. Reload and try again." };
  }
}
export async function connectRepository(
  slug: string,
  serviceId: string,
  integrationId: string,
  repositoryLinkId: string,
): Promise<IntegrationResult> {
  const { user } = await requireSession();
  if (
    !validId(serviceId) ||
    !validId(integrationId) ||
    !validId(repositoryLinkId)
  )
    return unavailable;
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
        eq(service.id, serviceId),
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
        !(await lockActiveService(tx, workspace.id, serviceId))
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
            eq(serviceRepository.serviceId, serviceId),
          ),
        );
      if (
        !currentGrant?.enabled ||
        currentGrant.version !== grant.version ||
        currentGrant.installationId !== grant.installationId ||
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
          serviceId,
          repositoryLinkId,
          repositoryId: repository.id,
          fullName: repository.fullName,
        });
      return { ok: true, mappingId: id };
    });
  } catch (error) {
    reportDatabaseFailure("integration.connect", error);
    return {
      error: "Unable to connect this repository. Reload and try again.",
    };
  }
}
export async function syncRepositoryNow(
  slug: string,
  serviceId: string,
  mappingId: string,
) {
  const { user } = await requireSession();
  if (!validId(serviceId) || !validId(mappingId))
    return { status: "unavailable" as const, error: unavailable.error };
  return syncMapping(mappingId, { slug, serviceId, userId: user.id });
}
