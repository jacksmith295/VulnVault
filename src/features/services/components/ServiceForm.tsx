"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { TextLink } from "@/components/ui/link";
import { FormMessage } from "@/components/ui/form-message";
import { FormLayout } from "@/components/layout";
import { saveServiceAction } from "../actions";
import { serviceSchema } from "../validation";

type ServiceFormProps = {
  slug: string;
  service?: {
    id: string;
    version: number;
    name: string;
    description: string | null;
    repositoryUrls: string[];
  };
};

export function ServiceForm(props: ServiceFormProps) {
  return (
    <ServiceFormFields
      key={`${props.slug}:${props.service?.id ?? "new"}`}
      {...props}
    />
  );
}

function ServiceFormFields({ slug, service }: ServiceFormProps) {
  // Keep the version tied to the initial field values when refreshed server props arrive.
  const [version] = useState(service?.version ?? 1);
  const [state, action, pending] = useActionState(
    saveServiceAction.bind(null, slug, service?.id ?? null, version),
    { error: "", conflict: false },
  );
  const [name, setName] = useState(service?.name ?? "");
  const [description, setDescription] = useState(service?.description ?? "");
  const [urls, setUrls] = useState(service?.repositoryUrls.join("\n") ?? "");
  const [validation, setValidation] = useState("");
  return (
    <FormLayout
      action={action}
      width="narrow"
      aria-busy={pending}
      onSubmit={(event) => {
        const parsed = serviceSchema.safeParse({
          name,
          description,
          repositoryUrls: urls
            .split(/\r?\n/)
            .map((url) => url.trim())
            .filter(Boolean),
        });
        setValidation(parsed.success ? "" : parsed.error.issues[0].message);
        if (!parsed.success) event.preventDefault();
      }}
    >
      <FormField id="service-name" label="Name">
        <Input
          id="service-name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      <FormField id="service-description" label="Description">
        <Textarea
          id="service-description"
          name="description"
          maxLength={5000}
          rows={5}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </FormField>
      <FormField
        id="service-repositories"
        label="Repository URLs"
        description="Optional. Enter up to 20 HTTP or HTTPS repository URLs, one per line. Include a repository path and omit credentials, query strings, and fragments."
      >
        <Textarea
          id="service-repositories"
          name="repositoryUrls"
          rows={5}
          aria-describedby="service-repositories-description"
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
          href={`/w/${slug}/services/${service?.id}/edit`}
        >
          Reload latest version
        </TextLink>
      )}
      <Button type="submit" disabled={pending}>
        {pending
          ? "Saving service..."
          : service
            ? "Save changes"
            : "Create service"}
      </Button>
    </FormLayout>
  );
}
