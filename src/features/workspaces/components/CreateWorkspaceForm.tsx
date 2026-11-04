"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { FormLayout } from "@/components/layout";
import { createWorkspaceAction } from "../actions";
import { suggestSlug } from "../validation";

export function CreateWorkspaceForm() {
  const [state, action, pending] = useActionState(createWorkspaceAction, {
    error: "",
  });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  return (
    <FormLayout action={action} width="narrow" aria-busy={pending}>
      <FormField id="workspace-name" label="Workspace name">
        <Input
          id="workspace-name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            if (!slugEdited) setSlug(suggestSlug(event.target.value));
          }}
        />
      </FormField>
      <FormField
        id="workspace-slug"
        label="URL slug"
        description={`Use lowercase letters and numbers separated by single hyphens. This becomes /w/${slug || "your-workspace"}.`}
      >
        <Input
          id="workspace-slug"
          name="slug"
          required
          minLength={3}
          maxLength={63}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          value={slug}
          onChange={(event) => {
            setSlugEdited(true);
            setSlug(event.target.value);
          }}
          aria-describedby="workspace-slug-description"
        />
      </FormField>
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      <Button type="submit" disabled={pending}>
        {pending ? "Creating workspace..." : "Create workspace"}
      </Button>
    </FormLayout>
  );
}
