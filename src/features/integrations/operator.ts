import "server-only";
import { reportDatabaseFailure } from "@/lib/server/diagnostics";
import { randomUUID } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  integrationRepository,
  organization,
  service,
  serviceRepository,
  workspaceIntegration,
} from "@/db/schema";
import { invalidateMappings, lockActiveService } from "./internal";
import { parseGithubRepositoryUrl } from "./repository-url";
import type { GithubInstallation, GithubRepository } from "./types";
import type { IntegrationResult } from "./data";

// Only the trusted host command calls this after app-authenticated installation validation.
export async function provisionGithubIntegration(
  slug: string,
  installation: GithubInstallation,
  repository: GithubRepository,
): Promise<IntegrationResult> {
  try {
    return await db.transaction(async (tx): Promise<IntegrationResult> => {
      const [workspace] = await tx
        .select()
        .from(organization)
        .where(eq(organization.slug, slug))
        .for("update");
      if (!workspace) return { error: "Workspace unavailable." };
      const [claimed] = await tx
        .select()
        .from(workspaceIntegration)
        .where(eq(workspaceIntegration.installationId, installation.id));
      if (claimed && claimed.workspaceId !== workspace.id)
        return {
          error: "This installation already belongs to another workspace.",
        };
      const [existing] = await tx
        .select()
        .from(workspaceIntegration)
        .where(
          and(
            eq(workspaceIntegration.workspaceId, workspace.id),
            eq(workspaceIntegration.accountId, installation.accountId),
          ),
        );
      if (existing && existing.appId !== installation.appId)
        return {
          error: "The existing connection belongs to another GitHub App.",
        };
      const links = (
        await tx
          .select({ link: serviceRepository, service: service })
          .from(serviceRepository)
          .innerJoin(service, eq(service.id, serviceRepository.serviceId))
          .where(
            and(
              eq(service.workspaceId, workspace.id),
              isNull(service.archivedAt),
            ),
          )
      )
        .filter(
          (row) =>
            parseGithubRepositoryUrl(row.link.url)?.toLowerCase() ===
            repository.fullName.toLowerCase(),
        )
        .sort((a, b) => a.service.id.localeCompare(b.service.id));
      for (const row of links)
        await lockActiveService(tx, workspace.id, row.service.id);
      const integrationId = existing?.id ?? randomUUID();
      const identity = {
        installationId: installation.id,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        enabled: true,
      };
      if (existing) {
        await tx
          .update(workspaceIntegration)
          .set({
            ...identity,
            version: sql`${workspaceIntegration.version} + 1`,
          })
          .where(eq(workspaceIntegration.id, integrationId));
        await invalidateMappings(tx, integrationId);
      } else
        await tx
          .insert(workspaceIntegration)
          .values({
            id: integrationId,
            workspaceId: workspace.id,
            provider: "github",
            appId: installation.appId,
            accountId: installation.accountId,
            ...identity,
          });
      let mappedRepositories = 0;
      for (const row of links) {
        const [mapped] = await tx
          .select()
          .from(integrationRepository)
          .where(eq(integrationRepository.repositoryLinkId, row.link.id));
        if (
          mapped &&
          (mapped.integrationId !== integrationId ||
            mapped.repositoryId !== repository.id)
        )
          throw new Error("Repository identity changed");
        if (!mapped)
          await tx
            .insert(integrationRepository)
            .values({
              id: randomUUID(),
              workspaceId: workspace.id,
              integrationId,
              serviceId: row.service.id,
              repositoryLinkId: row.link.id,
              repositoryId: repository.id,
              fullName: repository.fullName,
            });
        mappedRepositories++;
      }
      return { ok: true, integrationId, mappedRepositories };
    });
  } catch (error) {
    reportDatabaseFailure("integration.bind", error);
    return {
      error:
        "Unable to bind this installation. Check installation ownership and repository identity.",
    };
  }
}
