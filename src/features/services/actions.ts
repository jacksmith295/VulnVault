"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { changeServiceArchive, createService, editService } from "./data";
import { serviceFormInput } from "./validation";

export type ServiceFormState = { error: string; conflict?: boolean };

export async function saveServiceAction(
  slug: string,
  id: string | null,
  version: number,
  _previous: ServiceFormState,
  form: FormData,
): Promise<ServiceFormState> {
  const input = serviceFormInput(form);
  const result =
    id === null
      ? await createService(slug, input)
      : await editService(slug, id, version, input);
  if (result.error !== undefined)
    return { error: result.error, conflict: result.conflict };
  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/findings`);
  revalidatePath(`/w/${slug}/services/${result.service.id}`);
  redirect(`/w/${slug}/services/${result.service.id}`);
}

export async function archiveServiceAction(
  slug: string,
  id: string,
  version: number,
  archive: boolean,
  _previous: ServiceFormState,
  form: FormData,
): Promise<ServiceFormState> {
  const entries = [...form.entries()].filter(
    ([key]) => !key.startsWith("$ACTION_"),
  );
  if (
    entries.length !== 1 ||
    entries[0][0] !== "confirmed" ||
    entries[0][1] !== "yes"
  )
    return { error: "Confirm the service status change to continue." };
  const result = await changeServiceArchive(slug, id, version, archive);
  if (result.error !== undefined)
    return { error: result.error, conflict: result.conflict };
  revalidatePath(`/w/${slug}`);
  revalidatePath(`/w/${slug}/findings`);
  revalidatePath(`/w/${slug}/services/${id}`);
  redirect(`/w/${slug}/services/${id}`);
}
