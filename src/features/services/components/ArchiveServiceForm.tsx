"use client";

import { useActionState } from "react";
import { FormLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { FormMessage } from "@/components/ui/form-message";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { archiveServiceAction } from "../actions";

export function ArchiveServiceForm({
  slug,
  id,
  version,
  archived,
}: {
  slug: string;
  id: string;
  version: number;
  archived: boolean;
}) {
  const [state, action, pending] = useActionState(
    archiveServiceAction.bind(null, slug, id, version, !archived),
    { error: "", conflict: false },
  );
  return (
    <FormLayout action={action} width="narrow" tone="surface" aria-busy={pending}>
      <Text size="sm" tone="muted">
        {archived
          ? "Restore this service to the active list so it can be edited."
          : "Archiving preserves details and repositories and removes this service from the active list."}
      </Text>
      <CheckboxField
        name="confirmed"
        value="yes"
        required
        label={
          archived
            ? "I want to restore this service to the active list."
            : "I understand this service will leave the active list."
        }
      />
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.conflict && (
        <TextLink reloadDocument href={`/w/${slug}/services/${id}`}>
          Reload latest version
        </TextLink>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Updating service..."
          : archived
            ? "Restore service"
            : "Archive service"}
      </Button>
    </FormLayout>
  );
}
