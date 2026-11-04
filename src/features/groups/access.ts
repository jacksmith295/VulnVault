import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  member,
  organization,
  service,
  serviceAccessGroup,
  groupMembership,
} from "@/db/schema";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// All permission-sensitive writes take this lock first. Exclusive access changes
// wait for authorized writes, and subsequent writes see the committed permissions.
export async function lockWorkspaceAccess(
  tx: Transaction,
  slug: string,
  userId: string,
  exclusive = false,
) {
  const [workspace] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.slug, slug))
    .for(exclusive ? "update" : "share");
  if (!workspace) return null;
  const [membership] = await tx
    .select({ memberId: member.id, role: member.role })
    .from(member)
    .where(
      and(eq(member.organizationId, workspace.id), eq(member.userId, userId)),
    )
    .for("share");
  if (!membership || !["owner", "admin", "member"].includes(membership.role))
    return null;
  return { ...workspace, ...membership };
}

export function serviceAccessCondition(userId: string) {
  return sql`exists (select 1 from ${member} m where m.organization_id = ${service.workspaceId} and m.user_id = ${userId} and (
    m.role in ('owner', 'admin') or (m.role = 'member' and (
      not exists (select 1 from ${serviceAccessGroup} a where a.service_id = ${service.id})
      or exists (select 1 from ${serviceAccessGroup} a inner join ${groupMembership} gm on gm.group_id = a.group_id and gm.workspace_id = a.workspace_id where a.service_id = ${service.id} and gm.member_id = m.id)
    ))))`;
}
