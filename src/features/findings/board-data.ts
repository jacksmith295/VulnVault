import "server-only";

import { createHash, randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  finding,
  groupMembership,
  member,
  organization,
  service,
  serviceAccessGroup,
  workspaceGroup,
} from "@/db/schema";
import {
  serviceAccessCondition,
  type Transaction,
} from "@/features/groups/access";
import { requireSession } from "@/lib/auth-session";
import { workspaceRoles, type Workspace } from "@/features/workspaces/data";
import {
  boardFilterError,
  parseBoardFilters,
  type FindingStatus,
} from "./board-validation";
import { severities, statuses } from "./validation";

export type BoardFinding = {
  id: string;
  title: string;
  severity: (typeof severities)[number];
  status: FindingStatus;
  version: number;
  serviceId: string;
  serviceName: string;
  archived: boolean;
};
export type BoardColumn = {
  status: FindingStatus;
  total: number;
  findings: BoardFinding[];
  nextCursor: string | null;
};
const pageSize = 20;
const projection = {
  id: finding.id,
  title: finding.title,
  severity: finding.severity,
  status: finding.status,
  version: finding.version,
  serviceId: service.id,
  serviceName: service.name,
  archived: sql<boolean>`${service.archivedAt} is not null`,
};
function digest(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
async function context(
  tx: Transaction,
  slug: string,
  userId: string,
  input: unknown,
) {
  const [workspace] = await tx
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
  if (!workspace) return null;
  const services = await tx
    .select({ id: service.id, name: service.name, version: service.version })
    .from(service)
    .where(
      and(
        eq(service.workspaceId, workspace.id),
        serviceAccessCondition(userId),
      ),
    )
    .orderBy(asc(service.id));
  const groups = await tx
    .select({
      id: workspaceGroup.id,
      name: workspaceGroup.name,
      isDefault: workspaceGroup.isDefault,
      version: workspaceGroup.version,
    })
    .from(workspaceGroup)
    .where(
      and(
        eq(workspaceGroup.workspaceId, workspace.id),
        workspace.role === "member"
          ? or(
              eq(workspaceGroup.isDefault, true),
              sql`exists (select 1 from ${groupMembership} gm where gm.group_id = ${workspaceGroup.id} and gm.workspace_id = ${workspace.id} and gm.member_id = ${workspace.memberId})`,
            )
          : undefined,
      ),
    )
    .orderBy(asc(workspaceGroup.id));
  const parsed = parseBoardFilters(input);
  const { filters } = parsed;
  const error =
    parsed.error ||
    (filters.service &&
      !services.some((item) => item.id === filters.service)) ||
    (filters.group && !groups.some((item) => item.id === filters.group))
      ? boardFilterError
      : undefined;
  const scopeKey = digest({
    workspace: workspace.id,
    userId,
    role: workspace.role,
    services,
    groups,
    filters,
    error,
  });
  const group = groups.find((item) => item.id === filters.group);
  const condition = and(
    eq(service.workspaceId, workspace.id),
    serviceAccessCondition(userId),
    filters.service ? eq(service.id, filters.service) : undefined,
    filters.archive === "active"
      ? isNull(service.archivedAt)
      : filters.archive === "archived"
        ? isNotNull(service.archivedAt)
        : undefined,
    filters.severity ? eq(finding.severity, filters.severity) : undefined,
    filters.status ? eq(finding.status, filters.status) : undefined,
    group
      ? group.isDefault
        ? sql`not exists (select 1 from ${serviceAccessGroup} a where a.service_id = ${service.id})`
        : sql`exists (select 1 from ${serviceAccessGroup} a where a.service_id = ${service.id} and a.workspace_id = ${workspace.id} and a.group_id = ${group.id})`
      : undefined,
  );
  return {
    workspace: {
      id: workspace.id,
      name: workspace.name,
      slug: workspace.slug,
      role: workspace.role,
    } as Workspace,
    filters,
    services,
    groups,
    error,
    scopeKey,
    condition,
  };
}
async function totals(tx: Transaction, condition: ReturnType<typeof and>) {
  return tx
    .select({
      status: finding.status,
      total: count(),
    })
    .from(finding)
    .innerJoin(service, eq(service.id, finding.serviceId))
    .where(condition)
    .groupBy(finding.status);
}
async function page(
  tx: Transaction,
  condition: ReturnType<typeof and>,
  status: FindingStatus,
  cursor?: string,
  anchorScope?: ReturnType<typeof and>,
) {
  // The anchor is resolved in SQL so PostgreSQL microseconds never pass through Date.
  const after = cursor
    ? sql`(${finding.createdAt}, ${finding.id}) < (select ${finding.createdAt}, ${finding.id} from ${finding} inner join ${service} on ${service.id} = ${finding.serviceId} where ${finding.id} = ${cursor} and ${anchorScope})`
    : undefined;
  const rows = await tx
    .select(projection)
    .from(finding)
    .innerJoin(service, eq(service.id, finding.serviceId))
    .where(and(condition, eq(finding.status, status), after))
    .orderBy(desc(finding.createdAt), desc(finding.id))
    .limit(pageSize + 1);
  const findings = rows.slice(0, pageSize) as BoardFinding[];
  return {
    findings,
    nextCursor: rows.length > pageSize ? findings.at(-1)!.id : null,
  };
}
export async function getFindingBoard(slug: string, input: unknown) {
  const { user } = await requireSession();
  return db.transaction(
    async (tx) => {
      const scope = await context(tx, slug, user.id, input);
      if (!scope) notFound();
      const counts = scope.error ? [] : await totals(tx, scope.condition);
      const columns: BoardColumn[] = [];
      for (const status of statuses) {
        const total = counts.find((row) => row.status === status)?.total ?? 0;
        const result = total
          ? await page(tx, scope.condition, status)
          : { findings: [], nextCursor: null };
        columns.push({ status, total, ...result });
      }
      return {
        workspace: scope.workspace,
        filters: scope.filters,
        services: scope.services.map(({ id, name }) => ({ id, name })),
        groups: scope.groups.map(({ id, name }) => ({ id, name })),
        columns,
        scopeKey: scope.scopeKey,
        revisionKey: randomUUID(),
        filterError: scope.error,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type MoreBoardFindings =
  | { reset: true }
  | {
      reset: false;
      status: FindingStatus;
      total: number;
      scopeKey: string;
      findings: BoardFinding[];
      nextCursor: string | null;
    };
export async function getMoreBoardFindings(
  slug: string,
  input: unknown,
  status: unknown,
  cursor: unknown,
  expectedScopeKey: unknown,
): Promise<MoreBoardFindings> {
  const { user } = await requireSession();
  return db.transaction(
    async (tx): Promise<MoreBoardFindings> => {
      const scope = await context(tx, slug, user.id, input);
      if (
        !scope ||
        scope.error ||
        scope.scopeKey !== expectedScopeKey ||
        typeof status !== "string" ||
        !statuses.includes(status as FindingStatus) ||
        typeof cursor !== "string" ||
        cursor.length < 1 ||
        cursor.length > 200
      )
        return { reset: true };
      // Anchors may have changed status or severity since the preceding page.
      const [anchor] = await tx
        .select({ id: finding.id })
        .from(finding)
        .innerJoin(service, eq(service.id, finding.serviceId))
        .where(
          and(
            eq(finding.id, cursor),
            eq(service.workspaceId, scope.workspace.id),
            serviceAccessCondition(user.id),
          ),
        )
        .limit(1);
      if (!anchor) return { reset: true };
      const counts = await totals(tx, scope.condition);
      return {
        reset: false,
        status: status as FindingStatus,
        total: counts.find((row) => row.status === status)?.total ?? 0,
        scopeKey: scope.scopeKey,
        ...(await page(
          tx,
          scope.condition,
          status as FindingStatus,
          cursor,
          and(
            eq(service.workspaceId, scope.workspace.id),
            serviceAccessCondition(user.id),
          ),
        )),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
