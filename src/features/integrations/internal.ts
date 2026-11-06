import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { integrationRepository, organization, service } from "@/db/schema";
import { lockWorkspaceAccess } from "@/features/groups/access";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const unavailable = {
  error: "Integration unavailable or you do not have permission to manage it.",
} as const;
export const changed = {
  error: "This connection changed. Reload and try again.",
  conflict: true,
} as const;
export async function lockAdmin(
  tx: Transaction,
  slug: string,
  userId: string,
  exclusive = false,
) {
  const workspace = await lockWorkspaceAccess(tx, slug, userId, exclusive);
  return workspace && ["owner", "admin"].includes(workspace.role)
    ? workspace
    : null;
}
export async function lockAutomationWorkspace(
  tx: Transaction,
  workspaceId: string,
) {
  const [workspace] = await tx
    .select()
    .from(organization)
    .where(eq(organization.id, workspaceId))
    .for("share");
  return workspace;
}
export async function lockActiveService(
  tx: Transaction,
  workspaceId: string,
  serviceId: string,
) {
  const [found] = await tx
    .select()
    .from(service)
    .where(and(eq(service.id, serviceId), eq(service.workspaceId, workspaceId)))
    .for("share");
  return found && !found.archivedAt ? found : null;
}
export function validId(value: string) {
  return typeof value === "string" && value.length > 0 && value.length <= 200;
}

export async function invalidateMappings(
  tx: Transaction,
  integrationId: string,
) {
  await tx
    .update(integrationRepository)
    .set({
      version: sql`${integrationRepository.version} + 1`,
      leaseToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: sql`now()`,
    })
    .where(eq(integrationRepository.integrationId, integrationId));
}
