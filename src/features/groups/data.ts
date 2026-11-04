import "server-only";
import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import {
  workspaceGroup,
  groupMembership,
  serviceAccessGroup,
  member,
  user as users,
  service,
} from "@/db/schema";
import { requireSession } from "@/lib/auth-session";
import { requireWorkspace } from "@/features/workspaces/data";
import { requireService, type ServiceResult } from "@/features/services/data";
import { versionSchema } from "@/features/services/validation";
import { lockWorkspaceAccess } from "./access";
import {
  createGroupSchema,
  editGroupSchema,
  serviceAccessSchema,
} from "./validation";

type Group = typeof workspaceGroup.$inferSelect;
export type GroupResult =
  | { group: Group; error?: never; conflict?: never }
  | { error: string; conflict?: boolean; group?: never };
const denied = {
  error: "Group unavailable or you do not have permission to manage it.",
} as const;
const conflict = {
  error: "This group changed. Reload the latest version and try again.",
  conflict: true,
} as const;
const serviceConflict = {
  error: "This service changed. Reload the latest version and try again.",
  conflict: true,
} as const;
export async function listGroups(slug: string) {
  const workspace = await requireWorkspace(slug, ["owner", "admin"]);
  const groups = await db
    .select({
      id: workspaceGroup.id,
      name: workspaceGroup.name,
      isDefault: workspaceGroup.isDefault,
      version: workspaceGroup.version,
      memberCount: sql<number>`case when ${workspaceGroup.isDefault} then (select count(*)::int from ${member} where ${member.organizationId} = ${workspaceGroup.workspaceId} and ${member.role} in ('owner','admin','member')) else (select count(*)::int from ${groupMembership} where ${groupMembership.groupId} = ${workspaceGroup.id}) end`,
      serviceCount: sql<number>`case when ${workspaceGroup.isDefault} then (select count(*)::int from ${service} s where s.workspace_id = ${workspaceGroup.workspaceId} and not exists (select 1 from ${serviceAccessGroup} a where a.service_id = s.id)) else (select count(*)::int from ${serviceAccessGroup} where ${serviceAccessGroup.groupId} = ${workspaceGroup.id}) end`,
    })
    .from(workspaceGroup)
    .where(eq(workspaceGroup.workspaceId, workspace.id))
    .orderBy(
      sql`${workspaceGroup.isDefault} desc`,
      asc(workspaceGroup.name),
      asc(workspaceGroup.id),
    );
  return { workspace, groups };
}
export async function requireGroup(slug: string, id: string) {
  const { workspace, groups } = await listGroups(slug);
  const group = groups.find((g) => g.id === id);
  if (!group) notFound();
  const memberships = await db
    .select({ id: groupMembership.memberId })
    .from(groupMembership)
    .where(
      and(
        eq(groupMembership.workspaceId, workspace.id),
        eq(groupMembership.groupId, id),
      ),
    );
  const members = await db
    .select({ id: member.id, name: users.name, email: users.email })
    .from(member)
    .innerJoin(users, eq(users.id, member.userId))
    .where(
      and(
        eq(member.organizationId, workspace.id),
        inArray(member.role, ["owner", "admin", "member"]),
      ),
    )
    .orderBy(asc(users.name), asc(member.id));
  return {
    workspace,
    group,
    members: members.map((m) => ({
      ...m,
      selected: group.isDefault || memberships.some((v) => v.id === m.id),
    })),
  };
}
export async function createGroup(
  slug: string,
  input: unknown,
): Promise<GroupResult> {
  const { user } = await requireSession();
  const parsed = createGroupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  try {
    return await db.transaction(async (tx): Promise<GroupResult> => {
      const workspace = await lockWorkspaceAccess(tx, slug, user.id, true);
      if (!workspace || !["owner", "admin"].includes(workspace.role))
        return denied;
      const [group] = await tx
        .insert(workspaceGroup)
        .values({
          id: randomUUID(),
          workspaceId: workspace.id,
          name: parsed.data.name,
        })
        .returning();
      return { group };
    });
  } catch {
    return {
      error: "Unable to create the group. Use a unique name and try again.",
    };
  }
}
export async function editGroup(
  slug: string,
  id: string,
  version: number,
  input: unknown,
): Promise<GroupResult> {
  const { user } = await requireSession();
  const parsed = editGroupSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!versionSchema.safeParse(version).success) return conflict;
  try {
    return await db.transaction(async (tx): Promise<GroupResult> => {
      const workspace = await lockWorkspaceAccess(tx, slug, user.id, true);
      if (!workspace || !["owner", "admin"].includes(workspace.role))
        return denied;
      const scope = and(
        eq(workspaceGroup.id, id),
        eq(workspaceGroup.workspaceId, workspace.id),
        eq(workspaceGroup.isDefault, false),
      );
      const [existing] = await tx
        .select()
        .from(workspaceGroup)
        .where(scope)
        .for("update");
      if (!existing) return denied;
      if (existing.version !== version) return conflict;
      const { memberIds, name } = parsed.data;
      if (memberIds.length) {
        const selected = await tx
          .select({ id: member.id })
          .from(member)
          .where(
            and(
              eq(member.organizationId, workspace.id),
              inArray(member.id, memberIds),
              inArray(member.role, ["owner", "admin", "member"]),
            ),
          )
          .for("share");
        if (selected.length !== memberIds.length)
          return { error: "Select existing members of this workspace." };
      }
      const [group] = await tx
        .update(workspaceGroup)
        .set({ name, version: sql`${workspaceGroup.version} + 1` })
        .where(scope)
        .returning();
      await tx
        .delete(groupMembership)
        .where(
          and(
            eq(groupMembership.workspaceId, workspace.id),
            eq(groupMembership.groupId, id),
          ),
        );
      if (memberIds.length)
        await tx
          .insert(groupMembership)
          .values(
            memberIds.map((memberId) => ({
              workspaceId: workspace.id,
              groupId: id,
              memberId,
            })),
          );
      return { group };
    });
  } catch {
    return {
      error: "Unable to save the group. Use a unique name and try again.",
    };
  }
}
export async function getServiceAccess(slug: string, id: string) {
  const { workspace, groups } = await listGroups(slug);
  const scope = await requireService(slug, id);
  const selected = await db
    .select({ id: serviceAccessGroup.groupId })
    .from(serviceAccessGroup)
    .where(
      and(
        eq(serviceAccessGroup.workspaceId, workspace.id),
        eq(serviceAccessGroup.serviceId, id),
      ),
    );
  const defaultGroup = groups.find((g) => g.isDefault);
  if (!defaultGroup) notFound();
  return {
    workspace,
    service: scope.service,
    groups: groups.filter((g) => !g.isDefault),
    defaultGroup,
    selectedGroupIds: selected.map((g) => g.id),
  };
}
export async function changeServiceAccess(
  slug: string,
  id: string,
  version: number,
  input: unknown,
): Promise<ServiceResult> {
  const { user } = await requireSession();
  const parsed = serviceAccessSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!versionSchema.safeParse(version).success) return serviceConflict;
  try {
    return await db.transaction(async (tx): Promise<ServiceResult> => {
      const workspace = await lockWorkspaceAccess(tx, slug, user.id, true);
      if (!workspace || !["owner", "admin"].includes(workspace.role))
        return denied;
      const scope = and(
        eq(service.id, id),
        eq(service.workspaceId, workspace.id),
      );
      const [existing] = await tx
        .select()
        .from(service)
        .where(scope)
        .for("update");
      if (!existing) return denied;
      if (existing.version !== version) return serviceConflict;
      const { groupIds, confirmDefault } = parsed.data;
      if (groupIds.length) {
        const selected = await tx
          .select({ id: workspaceGroup.id })
          .from(workspaceGroup)
          .where(
            and(
              eq(workspaceGroup.workspaceId, workspace.id),
              eq(workspaceGroup.isDefault, false),
              inArray(workspaceGroup.id, groupIds),
            ),
          );
        if (selected.length !== groupIds.length)
          return { error: "Select custom groups from this workspace." };
      } else {
        const [restricted] = await tx
          .select({ id: serviceAccessGroup.groupId })
          .from(serviceAccessGroup)
          .where(eq(serviceAccessGroup.serviceId, id))
          .limit(1);
        if (restricted && !confirmDefault)
          return {
            error: "Confirm that everyone in the workspace should have access.",
          };
      }
      await tx
        .delete(serviceAccessGroup)
        .where(
          and(
            eq(serviceAccessGroup.workspaceId, workspace.id),
            eq(serviceAccessGroup.serviceId, id),
          ),
        );
      if (groupIds.length)
        await tx
          .insert(serviceAccessGroup)
          .values(
            groupIds.map((groupId) => ({
              workspaceId: workspace.id,
              serviceId: id,
              groupId,
            })),
          );
      const [updated] = await tx
        .update(service)
        .set({ version: sql`${service.version} + 1`, updatedAt: new Date() })
        .where(scope)
        .returning();
      return { service: updated };
    });
  } catch {
    return { error: "Unable to change service access. Please try again." };
  }
}
