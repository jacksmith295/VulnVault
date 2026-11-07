"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { fieldErrors } from "@/lib/form-validation";
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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const fields = [
      ["name", "service-name"],
      ["description", "service-description"],
      ["repositoryUrls", "service-repositories"],
    ];
    const firstInvalid = fields.find(([field]) => errors[field]);
    if (firstInvalid) {
      formRef.current
        ?.querySelector<HTMLElement>(`#${firstInvalid[1]}`)
        ?.focus();
    }
  }, [errors]);
  return (
    <FormLayout
      ref={formRef}
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
        setErrors(parsed.success ? {} : fieldErrors(parsed.error.issues));
        if (!parsed.success) event.preventDefault();
      }}
    >
      <FormField error={errors.name} id="service-name" label="Name">
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
      <FormField
        error={errors.description}
        id="service-description"
        label="Description"
      >
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
        error={errors.repositoryUrls}
        label="Repository URLs"
        description="Optional. Enter up to 20 HTTP or HTTPS repository URLs, one per line. Include a repository path and omit credentials, query strings, and fragments."
      >
        <Textarea
          id="service-repositories"
          name="repositoryUrls"
          rows={5}
          value={urls}
          onChange={(event) => setUrls(event.target.value)}
        />
      </FormField>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
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
