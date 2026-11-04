"use client";

import { useActionState, useState } from "react";
import { FormLayout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { TextLink } from "@/components/ui/link";
import { saveFindingAction } from "../actions";
import type { Finding } from "../data";
import {
  createFindingSchema,
  editFindingSchema,
  severities,
  severityLabels,
  statuses,
  statusLabels,
} from "../validation";

type Props = {
  slug: string;
  serviceId: string;
  finding?: Finding & { referenceUrls: string[] };
};
export function FindingForm(props: Props) {
  return (
    <FindingFormFields
      key={`${props.slug}:${props.serviceId}:${props.finding?.id ?? "new"}`}
      {...props}
    />
  );
}
function FindingFormFields({ slug, serviceId, finding }: Props) {
  // Preserve the original version with the working fields across refreshed server props.
  const [version] = useState(finding?.version ?? 1);
  const [title, setTitle] = useState(finding?.title ?? "");
  const [description, setDescription] = useState(finding?.description ?? "");
  const [severity, setSeverity] = useState<string | null>(
    finding?.severity ?? null,
  );
  const [status, setStatus] = useState<string | null>(finding?.status ?? "new");
  const [notes, setNotes] = useState(finding?.remediationNotes ?? "");
  const [urls, setUrls] = useState(finding?.referenceUrls.join("\n") ?? "");
  const [validation, setValidation] = useState("");
  const [state, action, pending] = useActionState(
    saveFindingAction.bind(null, slug, serviceId, finding?.id ?? null, version),
    { error: "", conflict: false },
  );
  return (
    <FormLayout
      action={action}
      width="narrow"
      aria-busy={pending}
      onSubmit={(event) => {
        const input = {
          title,
          description,
          severity,
          remediationNotes: notes,
          referenceUrls: urls
            .split(/\r?\n/)
            .map((url) => url.trim())
            .filter(Boolean),
          ...(finding ? { status } : {}),
        };
        const parsed = (
          finding ? editFindingSchema : createFindingSchema
        ).safeParse(input);
        setValidation(parsed.success ? "" : parsed.error.issues[0].message);
        if (!parsed.success) event.preventDefault();
      }}
    >
      <FormField id="finding-title" label="Title">
        <Input
          id="finding-title"
          name="title"
          required
          minLength={2}
          maxLength={200}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </FormField>
      <FormField id="finding-description" label="Description">
        <Textarea
          id="finding-description"
          name="description"
          required
          maxLength={20000}
          rows={7}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FormField>
      <FormField id="finding-severity" label="Severity">
        <Select
          id="finding-severity"
          name="severity"
          value={severity}
          onValueChange={setSeverity}
          required
          placeholder="Select severity"
          options={severities.map((value) => ({
            value,
            label: severityLabels[value],
          }))}
        />
      </FormField>
      {finding && (
        <FormField id="finding-status" label="Status">
          <Select
            id="finding-status"
            name="status"
            value={status}
            onValueChange={setStatus}
            required
            options={statuses.map((value) => ({
              value,
              label: statusLabels[value],
            }))}
          />
        </FormField>
      )}
      <FormField
        id="finding-notes"
        label="Remediation notes"
        description="Optional. Record remediation work or the reason for a status decision."
      >
        <Textarea
          id="finding-notes"
          name="remediationNotes"
          maxLength={20000}
          rows={5}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />
      </FormField>
      <FormField
        id="finding-references"
        label="Reference URLs"
        description="Optional. Enter up to 20 HTTP or HTTPS URLs, one per line. Credentials are not allowed."
      >
        <Textarea
          id="finding-references"
          name="referenceUrls"
          rows={5}
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
        />
      </FormField>
      {(validation || state.error) && (
        <FormMessage tone="error">{validation || state.error}</FormMessage>
      )}
      {state.conflict && (
        <TextLink
          reloadDocument
          href={`/w/${slug}/services/${serviceId}/findings/${finding?.id}/edit`}
        >
          Reload latest version
        </TextLink>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving finding..."
          : finding
            ? "Save changes"
            : "Create finding"}
      </Button>
    </FormLayout>
  );
}
