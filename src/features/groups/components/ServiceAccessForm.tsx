"use client";

import { useActionState, useState } from "react";
import { FormLayout, Section, Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { TextLink } from "@/components/ui/link";
import { Select } from "@/components/ui/select";
import { Text } from "@/components/ui/typography";
import { saveServiceAccessAction } from "../actions";

type Props = {
  slug: string;
  service: { id: string; version: number };
  groups: { id: string; name: string }[];
  selectedGroupIds: string[];
};

export function ServiceAccessForm(props: Props) {
  return (
    <ServiceAccessFields key={`${props.slug}:${props.service.id}`} {...props} />
  );
}

function ServiceAccessFields({
  slug,
  service,
  groups,
  selectedGroupIds,
}: Props) {
  const [version] = useState(service.version);
  const [initiallyRestricted] = useState(selectedGroupIds.length > 0);
  const [mode, setMode] = useState<"default" | "selected">(
    initiallyRestricted ? "selected" : "default",
  );
  const [selected, setSelected] = useState(selectedGroupIds);
  const [confirmed, setConfirmed] = useState(false);
  const [state, action, pending] = useActionState(
    saveServiceAccessAction.bind(null, slug, service.id, version),
    { error: "", conflict: false },
  );
  return (
    <FormLayout action={action} width="narrow" aria-busy={pending}>
      <Text>
        Owners and admins always have access. Other members can access a service
        when they belong to any selected group. Findings inherit their
        service&apos;s access.
      </Text>
      <FormField id="access-mode" label="Access mode">
        <Select
          id="access-mode"
          name="accessMode"
          value={mode}
          onValueChange={(value) => {
            if (value) setMode(value);
          }}
          options={[
            { value: "default", label: "Default group" },
            { value: "selected", label: "Selected groups" },
          ]}
          required
        />
      </FormField>
      {mode === "default" ? (
        <Text>
          Everyone is the default group and includes all workspace members.
        </Text>
      ) : (
        <Section
          title="Selected groups"
          description="Choose at least one custom group. Groups with no members grant no additional access. If every selected group is empty, only owners and admins can access the service."
        >
          <Stack>
            {groups.map((group) => (
              <CheckboxField
                key={group.id}
                name="groupIds"
                value={group.id}
                label={group.name}
                checked={selected.includes(group.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, group.id]
                      : current.filter((id) => id !== group.id),
                  )
                }
              />
            ))}
            {!groups.length && (
              <Text>
                Create a custom group before selecting restricted access.
              </Text>
            )}
          </Stack>
        </Section>
      )}
      {mode === "default" && initiallyRestricted && (
        <CheckboxField
          name="confirmDefault"
          value="true"
          required
          label="I understand that all workspace members will gain access."
          checked={confirmed}
          onCheckedChange={setConfirmed}
        />
      )}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.conflict && (
        <TextLink
          reloadDocument
          href={`/w/${slug}/services/${service.id}/access`}
        >
          Reload latest version
        </TextLink>
      )}
      <Button
        type="submit"
        disabled={pending || (mode === "selected" && !selected.length)}
      >
        {pending ? "Saving access..." : "Save access"}
      </Button>
    </FormLayout>
  );
}
