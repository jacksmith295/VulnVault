import "server-only";
import { reportDatabaseFailure } from "@/lib/server/diagnostics";

import { randomUUID } from "node:crypto";
import { and, asc, eq, isNotNull, isNull, notInArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { service, serviceRepository } from "@/db/schema";
import { requireSession } from "@/lib/auth-session";
import { requireWorkspace } from "@/features/workspaces/data";
import {
  lockWorkspaceAccess,
  serviceAccessCondition,
} from "@/features/groups/access";
import { serviceSchema, versionSchema } from "./validation";

const projection = {
  id: service.id,
  name: service.name,
  description: service.description,
  archivedAt: service.archivedAt,
  createdAt: service.createdAt,
  updatedAt: service.updatedAt,
  version: service.version,
};
export type Service = {
  id: string;
  name: string;
  description: string | null;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
};
export type ServiceResult =
  | { service: Service; error?: never; conflict?: never }
  | { error: string; conflict?: boolean; service?: never };
const conflict = {
  error: "This service changed. Reload the latest version and try again.",
  conflict: true,
} as const;
const denied = {
  error: "Service unavailable or you do not have permission to manage it.",
} as const;

export async function listServices(slug: string, archived = false) {
  const workspace = await requireWorkspace(slug);
  const { user } = await requireSession();
  const services = await db
    .select(projection)
    .from(service)
    .where(
      and(
        eq(service.workspaceId, workspace.id),
        serviceAccessCondition(user.id),
        archived ? isNotNull(service.archivedAt) : isNull(service.archivedAt),
      ),
    )
    .orderBy(asc(service.name), asc(service.id));
  return { workspace, services };
}

export async function requireService(slug: string, id: string) {
  const workspace = await requireWorkspace(slug);
  const { user } = await requireSession();
  const [found] = await db
    .select(projection)
    .from(service)
    .where(
      and(
        eq(service.workspaceId, workspace.id),
        serviceAccessCondition(user.id),
        eq(service.id, id),
      ),
    )
    .limit(1);
  if (!found) notFound();
  const repositories = await db
    .select({ id: serviceRepository.id, url: serviceRepository.url })
    .from(serviceRepository)
    .innerJoin(service, eq(service.id, serviceRepository.serviceId))
    .where(
      and(
        eq(service.workspaceId, workspace.id),
        serviceAccessCondition(user.id),
        eq(service.id, id),
      ),
    )
    .orderBy(asc(serviceRepository.url));
  return { workspace, service: found, repositories };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockWorkspace(tx: Transaction, slug: string, userId: string) {
  const workspace = await lockWorkspaceAccess(tx, slug, userId);
  return workspace && ["owner", "admin"].includes(workspace.role)
    ? workspace
    : null;
}

export async function createService(
  slug: string,
  input: unknown,
): Promise<ServiceResult> {
  const { user } = await requireSession();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const workspace = await lockWorkspace(tx, slug, user.id);
      if (!workspace) return denied;
      const { repositoryUrls, ...details } = parsed.data;
      const [created] = await tx
        .insert(service)
        .values({ id: randomUUID(), workspaceId: workspace.id, ...details })
        .returning(projection);
      if (repositoryUrls.length)
        await tx
          .insert(serviceRepository)
          .values(
            repositoryUrls.map((url) => ({
              id: randomUUID(),
              serviceId: created.id,
              url,
            })),
          );
      return { service: created };
    });
  } catch (error) {
    reportDatabaseFailure("service.create", error);
    return { error: "Unable to create the service. Please try again." };
  }
}

export async function editService(
  slug: string,
  id: string,
  version: number,
  input: unknown,
): Promise<ServiceResult> {
  const { user } = await requireSession();
  const parsed = serviceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!versionSchema.safeParse(version).success) return conflict;
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const workspace = await lockWorkspace(tx, slug, user.id);
      if (!workspace) return denied;
      const scope = and(
        eq(service.id, id),
        eq(service.workspaceId, workspace.id),
      );
      const [existing] = await tx
        .select({ id: service.id })
        .from(service)
        .where(scope)
        .limit(1);
      if (!existing) return denied;
      const { repositoryUrls, ...details } = parsed.data;
      const [updated] = await tx
        .update(service)
        .set({
          ...details,
          updatedAt: new Date(),
          version: sql`${service.version} + 1`,
        })
        .where(
          and(scope, eq(service.version, version), isNull(service.archivedAt)),
        )
        .returning(projection);
      if (!updated) return conflict;
      await tx
        .delete(serviceRepository)
        .where(
          and(
            eq(serviceRepository.serviceId, id),
            repositoryUrls.length
              ? notInArray(serviceRepository.url, repositoryUrls)
              : undefined,
          ),
        );
      const retained = await tx
        .select({ url: serviceRepository.url })
        .from(serviceRepository)
        .where(eq(serviceRepository.serviceId, id));
      const added = repositoryUrls.filter(
        (url) => !retained.some((repository) => repository.url === url),
      );
      if (added.length)
        await tx
          .insert(serviceRepository)
          .values(
            added.map((url) => ({ id: randomUUID(), serviceId: id, url })),
          );
      return { service: updated };
    });
  } catch (error) {
    reportDatabaseFailure("service.edit", error);
    return { error: "Unable to save the service. Please try again." };
  }
}

export async function changeServiceArchive(
  slug: string,
  id: string,
  version: number,
  archive: boolean,
): Promise<ServiceResult> {
  const { user } = await requireSession();
  if (!versionSchema.safeParse(version).success || typeof archive !== "boolean")
    return conflict;
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const workspace = await lockWorkspace(tx, slug, user.id);
      if (!workspace) return denied;
      const scope = and(
        eq(service.id, id),
        eq(service.workspaceId, workspace.id),
      );
      const [existing] = await tx
        .select({ id: service.id })
        .from(service)
        .where(scope)
        .limit(1);
      if (!existing) return denied;
      const [updated] = await tx
        .update(service)
        .set({
          archivedAt: archive ? new Date() : null,
          updatedAt: new Date(),
          version: sql`${service.version} + 1`,
        })
        .where(
          and(
            scope,
            eq(service.version, version),
            archive
              ? isNull(service.archivedAt)
              : isNotNull(service.archivedAt),
          ),
        )
        .returning(projection);
      return updated ? { service: updated } : conflict;
    });
  } catch (error) {
    reportDatabaseFailure("service.archive", error);
    return { error: "Unable to update the service. Please try again." };
  }
}
