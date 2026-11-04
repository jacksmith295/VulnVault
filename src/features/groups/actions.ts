"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeServiceAccess, createGroup, editGroup } from "./data";
import {
  createGroupFormInput,
  groupFormInput,
  serviceAccessFormInput,
} from "./validation";

export type GroupFormState = { error: string; conflict?: boolean };

export async function saveGroupAction(
  slug: string,
  id: string | null,
  version: number,
  _previous: GroupFormState,
  form: FormData,
): Promise<GroupFormState> {
  const input = id === null ? createGroupFormInput(form) : groupFormInput(form);
  const result =
    id === null
      ? await createGroup(slug, input)
      : await editGroup(slug, id, version, input);
  if (result.error !== undefined)
    return { error: result.error, conflict: result.conflict };
  revalidatePath(`/w/${slug}`, "layout");
  redirect(`/w/${slug}/groups/${result.group.id}`);
}

export async function saveServiceAccessAction(
  slug: string,
  id: string,
  version: number,
  _previous: GroupFormState,
  form: FormData,
): Promise<GroupFormState> {
  const modes = form.getAll("accessMode");
  const mode = modes[0];
  const groupIds = form.getAll("groupIds");
  if (
    modes.length !== 1 ||
    !["default", "selected"].includes(String(mode)) ||
    (mode === "selected" && !groupIds.length) ||
    (mode === "default" && groupIds.length)
  ) {
    return {
      error: "Choose the default group or select at least one custom group.",
    };
  }
  const inputForm = new FormData();
  for (const [key, value] of form.entries()) {
    if (key !== "accessMode") inputForm.append(key, value);
  }
  const result = await changeServiceAccess(
    slug,
    id,
    version,
    serviceAccessFormInput(inputForm),
  );
  if (result.error !== undefined)
    return { error: result.error, conflict: result.conflict };
  revalidatePath(`/w/${slug}`, "layout");
  redirect(`/w/${slug}/services/${result.service.id}`);
}
