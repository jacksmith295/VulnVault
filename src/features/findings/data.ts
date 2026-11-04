import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, notInArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  finding,
  findingReference,
  member,
  organization,
  service,
} from "@/db/schema";
import { requireSession } from "@/lib/auth-session";
import { requireService } from "@/features/services/data";
import { workspaceRoles } from "@/features/workspaces/data";
import { versionSchema } from "@/features/services/validation";
import { createFindingSchema, editFindingSchema } from "./validation";

export type Finding = typeof finding.$inferSelect;
export type FindingResult =
  | { finding: Finding; error?: never; conflict?: never }
  | { error: string; conflict?: boolean; finding?: never };
const denied = {
  error:
    "Finding unavailable or this service is archived. Restore the service before making changes.",
} as const;
const conflict = {
  error: "This finding changed. Reload the latest version and try again.",
  conflict: true,
} as const;

export async function listFindings(slug: string, serviceId: string) {
  const scope = await requireService(slug, serviceId);
  const findings = await db
    .select()
    .from(finding)
    .where(eq(finding.serviceId, scope.service.id))
    .orderBy(asc(finding.createdAt), asc(finding.id));
  return { ...scope, findings };
}
export async function requireFinding(
  slug: string,
  serviceId: string,
  id: string,
) {
  const scope = await requireService(slug, serviceId);
  const [found] = await db
    .select()
    .from(finding)
    .where(and(eq(finding.serviceId, scope.service.id), eq(finding.id, id)))
    .limit(1);
  if (!found) notFound();
  const references = await db
    .select({ id: findingReference.id, url: findingReference.url })
    .from(findingReference)
    .where(eq(findingReference.findingId, found.id))
    .orderBy(asc(findingReference.url));
  return { ...scope, finding: found, references };
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function lockScope(
  tx: Transaction,
  slug: string,
  serviceId: string,
  userId: string,
) {
  // Hold membership and service locks through commit so revocation and archival serialize with writes.
  const [workspace] = await tx
    .select({ id: organization.id, role: member.role })
    .from(member)
    .innerJoin(organization, eq(member.organizationId, organization.id))
    .where(and(eq(member.userId, userId), eq(organization.slug, slug)))
    .limit(1)
    .for("share", { of: member });
  if (!workspace || !workspaceRoles.some((role) => role === workspace.role))
    return null;
  const [active] = await tx
    .select({ id: service.id, archivedAt: service.archivedAt })
    .from(service)
    .where(
      and(eq(service.id, serviceId), eq(service.workspaceId, workspace.id)),
    )
    .limit(1)
    .for("share");
  return active && !active.archivedAt ? active : null;
}
async function saveReferences(tx: Transaction, id: string, urls: string[]) {
  await tx
    .delete(findingReference)
    .where(
      and(
        eq(findingReference.findingId, id),
        urls.length ? notInArray(findingReference.url, urls) : undefined,
      ),
    );
  const retained = await tx
    .select({ url: findingReference.url })
    .from(findingReference)
    .where(eq(findingReference.findingId, id));
  const added = urls.filter(
    (url) => !retained.some((reference) => reference.url === url),
  );
  if (added.length)
    await tx
      .insert(findingReference)
      .values(added.map((url) => ({ id: randomUUID(), findingId: id, url })));
}
export async function createFinding(
  slug: string,
  serviceId: string,
  input: unknown,
): Promise<FindingResult> {
  const { user } = await requireSession();
  const parsed = createFindingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    return await db.transaction(async (tx): Promise<FindingResult> => {
      if (!(await lockScope(tx, slug, serviceId, user.id))) return denied;
      const { referenceUrls, ...details } = parsed.data;
      const [created] = await tx
        .insert(finding)
        .values({
          id: randomUUID(),
          serviceId,
          ...details,
          status: "new",
          createdBy: user.id,
          updatedBy: user.id,
        })
        .returning();
      await saveReferences(tx, created.id, referenceUrls);
      return { finding: created };
    });
  } catch {
    return { error: "Unable to create the finding. Please try again." };
  }
}
export async function editFinding(
  slug: string,
  serviceId: string,
  id: string,
  version: number,
  input: unknown,
): Promise<FindingResult> {
  const { user } = await requireSession();
  const parsed = editFindingSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!versionSchema.safeParse(version).success) return conflict;
  try {
    return await db.transaction(async (tx): Promise<FindingResult> => {
      if (!(await lockScope(tx, slug, serviceId, user.id))) return denied;
      const scope = and(eq(finding.serviceId, serviceId), eq(finding.id, id));
      const [existing] = await tx
        .select()
        .from(finding)
        .where(scope)
        .limit(1)
        .for("update");
      if (!existing) return denied;
      const { referenceUrls, ...details } = parsed.data;
      const now = new Date();
      const resolvedAt =
        details.status === "resolved"
          ? existing.status === "resolved"
            ? existing.resolvedAt
            : now
          : null;
      const [updated] = await tx
        .update(finding)
        .set({
          ...details,
          resolvedAt,
          updatedBy: user.id,
          updatedAt: now,
          version: sql`${finding.version} + 1`,
        })
        .where(and(scope, eq(finding.version, version)))
        .returning();
      if (!updated) return conflict;
      await saveReferences(tx, id, referenceUrls);
      return { finding: updated };
    });
  } catch {
    return { error: "Unable to save the finding. Please try again." };
  }
}
