import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  finding,
  findingSource,
  groupMembership,
  member,
  organization,
  service,
  serviceAccessGroup,
  serviceRepository,
} from "@/db/schema";
import {
  serviceAccessCondition,
  type Transaction,
} from "@/features/groups/access";
import { workspaceRoles, type Workspace } from "@/features/workspaces/data";
import { requireSession } from "@/lib/auth-session";
import { parseFindingFilters } from "./filter-validation";
import { findingFilterCondition } from "./filter-data";

const projection = {
  id: finding.id,
  title: finding.title,
  severity: finding.severity,
  status: finding.status,
  createdAt: finding.createdAt,
  sourceKind: findingSource.kind,
  upstreamState: findingSource.state,
};
export type FindingListItem = {
  id: string;
  title: string;
  severity: typeof finding.$inferSelect.severity;
  status: typeof finding.$inferSelect.status;
  createdAt: Date;
  sourceKind: string | null;
  upstreamState: string | null;
};
const pageSize = 20;
async function context(
  tx: Transaction,
  slug: string,
  serviceId: string,
  userId: string,
  input: unknown,
) {
  const [membership] = await tx
    .select({
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      role: member.role,
      memberId: member.id,
    })
    .from(organization)
    .innerJoin(
      member,
      and(
        eq(member.organizationId, organization.id),
        eq(member.userId, userId),
        inArray(member.role, workspaceRoles),
      ),
    )
    .where(eq(organization.slug, slug))
    .limit(1);
  if (!membership) return null;
  const access = and(
    eq(service.workspaceId, membership.id),
    eq(service.id, serviceId),
    serviceAccessCondition(userId),
  );
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
    .where(access)
    .limit(1);
  if (!found) return null;
  const assignments = await tx
    .select({ groupId: serviceAccessGroup.groupId })
    .from(serviceAccessGroup)
    .where(
      and(
        eq(serviceAccessGroup.workspaceId, membership.id),
        eq(serviceAccessGroup.serviceId, serviceId),
      ),
    )
    .orderBy(asc(serviceAccessGroup.groupId));
  const grants = await tx
    .select({ groupId: groupMembership.groupId })
    .from(groupMembership)
    .where(
      and(
        eq(groupMembership.workspaceId, membership.id),
        eq(groupMembership.memberId, membership.memberId),
      ),
    )
    .orderBy(asc(groupMembership.groupId));
  const parsed = parseFindingFilters(input);
  const scopeKey = createHash("sha256")
    .update(
      JSON.stringify({
        workspaceId: membership.id,
        userId,
        memberId: membership.memberId,
        role: membership.role,
        service: found,
        assignments,
        grants,
        filters: parsed.filters,
        error: parsed.error,
      }),
    )
    .digest("hex");
  return {
    workspace: {
      id: membership.id,
      name: membership.name,
      slug: membership.slug,
      role: membership.role,
    } as Workspace,
    service: found,
    filters: parsed.filters,
    filterError: parsed.error,
    scopeKey,
    access,
    condition: and(access, findingFilterCondition(parsed.filters)),
  };
}
type Scope = NonNullable<Awaited<ReturnType<typeof context>>>;
async function total(tx: Transaction, scope: Scope) {
  const [result] = await tx
    .select({ total: count() })
    .from(finding)
    .innerJoin(service, eq(service.id, finding.serviceId))
    .leftJoin(findingSource, eq(findingSource.findingId, finding.id))
    .where(scope.condition);
  return result.total;
}
async function page(tx: Transaction, scope: Scope, cursor?: string) {
  // Keep timestamp precision inside PostgreSQL and allow mutable filters to change on the anchor.
  const after = cursor
    ? sql`(${finding.createdAt}, ${finding.id}) < (select ${finding.createdAt}, ${finding.id} from ${finding} inner join ${service} on ${service.id} = ${finding.serviceId} where ${finding.id} = ${cursor} and ${scope.access})`
    : undefined;
  const rows = await tx
    .select(projection)
    .from(finding)
    .innerJoin(service, eq(service.id, finding.serviceId))
    .leftJoin(findingSource, eq(findingSource.findingId, finding.id))
    .where(and(scope.condition, after))
    .orderBy(desc(finding.createdAt), desc(finding.id))
    .limit(pageSize + 1);
  const findings = rows.slice(0, pageSize) as FindingListItem[];
  return {
    findings,
    nextCursor: rows.length > pageSize ? findings.at(-1)!.id : null,
  };
}
export async function listFindings(
  slug: string,
  serviceId: string,
  input: unknown = {},
) {
  const { user } = await requireSession();
  return db.transaction(
    async (tx) => {
      const scope = await context(tx, slug, serviceId, user.id, input);
      if (!scope) notFound();
      const repositories = await tx
        .select({ id: serviceRepository.id, url: serviceRepository.url })
        .from(serviceRepository)
        .innerJoin(service, eq(service.id, serviceRepository.serviceId))
        .where(scope.access)
        .orderBy(asc(serviceRepository.url));
      return {
        workspace: scope.workspace,
        service: scope.service,
        repositories,
        filters: scope.filters,
        filterError: scope.filterError,
        scopeKey: scope.scopeKey,
        revisionKey: randomUUID(),
        total: scope.filterError ? 0 : await total(tx, scope),
        ...(scope.filterError
          ? { findings: [] as FindingListItem[], nextCursor: null }
          : await page(tx, scope)),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type MoreServiceFindings =
  | { reset: true }
  | {
      reset: false;
      scopeKey: string;
      total: number;
      findings: FindingListItem[];
      nextCursor: string | null;
    };
export async function getMoreServiceFindings(
  slug: string,
  serviceId: string,
  input: unknown,
  cursor: unknown,
  expectedScopeKey: unknown,
): Promise<MoreServiceFindings> {
  const { user } = await requireSession();
  return db.transaction(
    async (tx): Promise<MoreServiceFindings> => {
      const scope = await context(tx, slug, serviceId, user.id, input);
      if (
        !scope ||
        scope.filterError ||
        scope.scopeKey !== expectedScopeKey ||
        typeof cursor !== "string" ||
        !cursor.length ||
        cursor.length > 200
      )
        return { reset: true };
      const [anchor] = await tx
        .select({ id: finding.id })
        .from(finding)
        .innerJoin(service, eq(service.id, finding.serviceId))
        .where(and(scope.access, eq(finding.id, cursor)))
        .limit(1);
      if (!anchor) return { reset: true };
      return {
        reset: false,
        scopeKey: scope.scopeKey,
        total: await total(tx, scope),
        ...(await page(tx, scope, cursor)),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
