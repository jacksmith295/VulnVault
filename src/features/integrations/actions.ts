"use server";

import { revalidatePath } from "next/cache";
import {
  connectRepository,
  setIntegrationEnabled,
  setRepositoryEnabled,
  syncRepositoryNow,
} from "./data";

export type IntegrationFormState = {
  error: string;
  message?: string;
  conflict?: boolean;
};

function refresh(slug: string) {
  revalidatePath(`/w/${slug}`, "layout");
}

export async function connectRepositoryAction(
  slug: string,
  serviceId: string,
  integrationId: string,
  _previous: IntegrationFormState,
  form: FormData,
): Promise<IntegrationFormState> {
  const values = form.getAll("repositoryLinkId");
  if (values.length !== 1 || typeof values[0] !== "string" || !values[0]) {
    return { error: "Choose an existing service repository." };
  }
  const result = await connectRepository(slug, serviceId, integrationId, values[0]);
  if ("error" in result) return result;
  refresh(slug);
  return { error: "", message: "Repository connected." };
}

export async function setIntegrationEnabledAction(
  slug: string,
  id: string,
  version: number,
  enabled: boolean,
  _previous: IntegrationFormState,
): Promise<IntegrationFormState> {
  void _previous;
  const result = await setIntegrationEnabled(slug, id, version, enabled);
  if ("error" in result) return result;
  refresh(slug);
  return {
    error: "",
    message: enabled
      ? "Connection enabled."
      : "Connection disabled. Imported findings are retained.",
  };
}

export async function setRepositoryEnabledAction(
  slug: string,
  serviceId: string,
  id: string,
  version: number,
  enabled: boolean,
  _previous: IntegrationFormState,
): Promise<IntegrationFormState> {
  void _previous;
  const result = await setRepositoryEnabled(slug, serviceId, id, version, enabled);
  if ("error" in result) return result;
  refresh(slug);
  return {
    error: "",
    message: enabled
      ? "Repository enabled."
      : "Repository disabled. Imported findings are retained.",
  };
}

export async function syncRepositoryAction(
  slug: string,
  serviceId: string,
  id: string,
  _previous: IntegrationFormState,
): Promise<IntegrationFormState> {
  void _previous;
  const result = await syncRepositoryNow(slug, serviceId, id);
  refresh(slug);
  if (result.status === "success") {
    return {
      error: "",
      message: `Sync completed. ${result.imported ?? 0} new findings imported.`,
    };
  }
  if (result.status === "busy")
    return {
      error:
        "Another sync is running, or a retry delay is active. Check the connection status before retrying.",
    };
  if (result.status === "unavailable")
    return {
      error:
        "Sync is unavailable. Check connection, repository, and retry status.",
    };
  return {
    error:
      "Sync failed. Check the repository status and host configuration before retrying.",
  };
}
