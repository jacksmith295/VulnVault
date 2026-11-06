"use server";

import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth-session";
import { createWorkspace } from "./data";
import { rememberWorkspace } from "./preference";
import { workspaceFormInput } from "./validation";

export async function createWorkspaceAction(
  _previous: { error: string },
  form: FormData,
) {
  const result = await createWorkspace(workspaceFormInput(form));
  if (result.error !== undefined) return { error: result.error };
  const { user } = await requireSession();
  await rememberWorkspace(user.id, result.workspace.id);
  redirect(`/w/${result.workspace.slug}`);
}
