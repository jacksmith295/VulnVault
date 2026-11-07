"use client";

import { useActionState, useState } from "react";
import { FormLayout, Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { TextLink } from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import {
  connectRepositoryAction,
  setIntegrationEnabledAction,
  setRepositoryEnabledAction,
  syncRepositoryAction,
  type IntegrationFormState,
} from "../actions";

function ActionFeedback({
  state,
  href,
}: {
  state: IntegrationFormState;
  href: string;
}) {
  return (
    <>
      {state.error && <FormMessage>{state.error}</FormMessage>}
      {state.message && (
        <FormMessage tone="success">{state.message}</FormMessage>
      )}
      {state.conflict && (
        <TextLink href={href} reloadDocument>
          Reload latest connection settings
        </TextLink>
      )}
    </>
  );
}

export function IntegrationControl({
  slug,
  id,
  version,
  enabled,
  kind,
  disabled = false,
  serviceId,
}: {
  slug: string;
  id: string;
  version: number;
  enabled: boolean;
  disabled?: boolean;
} & (
  | { kind: "integration"; serviceId?: never }
  | { kind: "repository" | "sync"; serviceId: string }
)) {
  const operation =
    kind === "sync"
      ? syncRepositoryAction.bind(null, slug, serviceId!, id)
      : kind === "integration"
        ? setIntegrationEnabledAction.bind(null, slug, id, version, !enabled)
        : setRepositoryEnabledAction.bind(
            null,
            slug,
            serviceId!,
            id,
            version,
            !enabled,
          );
  const [state, action, pending] = useActionState(operation, { error: "" });
  const label =
    kind === "sync"
      ? "Sync now"
      : `${enabled ? "Disable" : "Enable"} ${kind === "integration" ? "connection" : "repository"}`;
  return (
    <FormLayout action={action} aria-busy={pending}>
      <Button type="submit" variant="outline" disabled={pending || disabled}>
        {pending ? (kind === "sync" ? "Syncing..." : "Updating...") : label}
      </Button>
      <ActionFeedback
        state={state}
        href={
          serviceId
            ? `/w/${slug}/services/${serviceId}/integrations`
            : `/w/${slug}/integrations`
        }
      />
    </FormLayout>
  );
}

export function ConnectRepositoryForm({
  slug,
  serviceId,
  integrationId,
  repositories,
}: {
  slug: string;
  serviceId: string;
  integrationId: string;
  repositories: { id: string; serviceName: string; url: string }[];
}) {
  const [repository, setRepository] = useState<string | null>(null);
  const selectedRepository = repositories.some((item) => item.id === repository)
    ? repository
    : null;
  // A successful connection removes its option. Clear only invalid drafts so
  // unrelated server refreshes preserve a still available repository selection.
  if (repository !== selectedRepository) setRepository(selectedRepository);
  const [state, action, pending] = useActionState(
    connectRepositoryAction.bind(null, slug, serviceId, integrationId),
    { error: "" },
  );
  const id = `repository-${serviceId}-${integrationId}`;
  return (
    <FormLayout action={action} width="narrow" aria-busy={pending}>
      <FormField
        id={id}
        label="Existing service repository"
        description="The GitHub App must have access to this repository with Dependabot alerts read permission."
      >
        <Select
          id={id}
          name="repositoryLinkId"
          value={selectedRepository}
          onValueChange={setRepository}
          options={repositories.map((item) => ({
            value: item.id,
            label: `${item.serviceName}: ${item.url}`,
          }))}
          placeholder="Choose a GitHub repository"
          required
        />
      </FormField>
      <Stack gap="sm">
        <Button type="submit" disabled={pending || selectedRepository === null}>
          {pending ? "Connecting..." : "Connect repository"}
        </Button>
        <ActionFeedback
          state={state}
          href={`/w/${slug}/services/${serviceId}/integrations`}
        />
      </Stack>
    </FormLayout>
  );
}
