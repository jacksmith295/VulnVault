"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-session";
import { createWorkspace, requireWorkspace } from "./data";
import { rememberWorkspace } from "./preference";
import { workspaceFormInput } from "./validation";

export async function createWorkspaceAction(_previous: { error: string }, form: FormData) {
  const result = await createWorkspace(workspaceFormInput(form));
  if (result.error !== undefined) return { error: result.error };
  const { user } = await requireSession();
  await rememberWorkspace(user.id, result.workspace.id);
  redirect(`/w/${result.workspace.slug}`);
}

export async function rememberWorkspaceAction(slug: string) {
  if (typeof slug !== "string" || slug.length > 63) return;
  const workspace = await requireWorkspace(slug);
  const { user } = await requireSession();
  await rememberWorkspace(user.id, workspace.id);
}
