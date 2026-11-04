"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createFinding, editFinding } from "./data";
import { findingFormInput } from "./validation";

export type FindingFormState = { error: string; conflict?: boolean };
export async function saveFindingAction(
  slug: string,
  serviceId: string,
  id: string | null,
  version: number,
  _previous: FindingFormState,
  form: FormData,
): Promise<FindingFormState> {
  const input = findingFormInput(form);
  const result =
    id === null
      ? await createFinding(slug, serviceId, input)
      : await editFinding(slug, serviceId, id, version, input);
  if (result.error !== undefined)
    return { error: result.error, conflict: result.conflict };
  const base = `/w/${slug}/services/${serviceId}`;
  revalidatePath(base);
  revalidatePath(`${base}/findings/${result.finding.id}`);
  redirect(`${base}/findings/${result.finding.id}`);
}
