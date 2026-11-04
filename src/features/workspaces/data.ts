import "server-only";

import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { member, organization, rateLimit } from "@/db/schema";
import { requireSession } from "@/lib/auth-session";
import { workspaceSchema } from "./validation";

export const workspaceRoles = ["owner", "admin", "member"] as const;
export type WorkspaceRole = typeof workspaceRoles[number];
export type Workspace = { id: string; name: string; slug: string; role: WorkspaceRole };
const projection = { id: organization.id, name: organization.name, slug: organization.slug, role: member.role };

export async function listWorkspaces(): Promise<Workspace[]> {
  const { user } = await requireSession();
  return await db.select(projection).from(organization).innerJoin(member, and(
    eq(member.organizationId, organization.id), eq(member.userId, user.id), inArray(member.role, workspaceRoles),
  )).orderBy(asc(organization.createdAt), asc(organization.id)) as Workspace[];
}

export async function requireWorkspace(slug: string, roles: readonly WorkspaceRole[] = workspaceRoles): Promise<Workspace> {
  const { user } = await requireSession();
  const [workspace] = await db.select(projection).from(organization).innerJoin(member, and(
    eq(member.organizationId, organization.id), eq(member.userId, user.id), inArray(member.role, workspaceRoles),
  )).where(eq(organization.slug, slug)).limit(1);
  if (!workspace || !roles.includes(workspace.role as WorkspaceRole)) notFound();
  return workspace as Workspace;
}

export type CreateWorkspaceResult = { workspace: Workspace; error?: never } | { error: string; workspace?: never };

export async function createWorkspace(input: unknown): Promise<CreateWorkspaceResult> {
  const { user } = await requireSession();
  // This committed counter survives validation errors and rollback. Keep its window at 60 seconds or less: Better Auth cleans this shared table.
  const now = Date.now();
  let limit: { count: number };
  try {
    [limit] = await db.insert(rateLimit).values({
      id: randomUUID(), key: `workspace-create:${user.id}`, count: 1, lastRequest: now,
    }).onConflictDoUpdate({
      target: rateLimit.key,
      set: {
        count: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60_000} THEN 1 ELSE ${rateLimit.count} + 1 END`,
        lastRequest: sql`CASE WHEN ${rateLimit.lastRequest} <= ${now - 60_000} THEN ${now} ELSE ${rateLimit.lastRequest} END`,
      },
    }).returning({ count: rateLimit.count });
  } catch {
    return { error: "Unable to create the workspace. Please try again." };
  }
  if (limit.count > 5) return { error: "Too many workspace creation attempts. Please wait a minute and try again." };
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const workspace = { id: randomUUID(), ...parsed.data, role: "owner" as const };
  try {
    await db.transaction(async (tx) => {
      await tx.insert(organization).values({ id: workspace.id, name: workspace.name, slug: workspace.slug, createdAt: new Date() });
      await tx.insert(member).values({ id: randomUUID(), organizationId: workspace.id, userId: user.id, role: "owner", createdAt: new Date() });
    });
    return { workspace };
  } catch (error) {
    const cause = (error as { cause?: { code?: string; constraint?: string } }).cause;
    if (cause?.code === "23505" && cause.constraint === "organization_slug_unique") {
      return { error: "That URL slug is already in use. Choose another slug." };
    }
    return { error: "Unable to create the workspace. Please try again." };
  }
}
