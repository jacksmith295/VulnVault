"use client";

import { useActionState, useState } from "react";
import { FormLayout, Section, Stack } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { Input } from "@/components/ui/input";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { saveGroupAction } from "../actions";

type Props = {
  slug: string;
  group?: { id: string; name: string; version: number };
  members?: { id: string; name: string; email: string; selected: boolean }[];
};

export function GroupForm(props: Props) {
  return (
    <GroupFormFields
      key={`${props.slug}:${props.group?.id ?? "new"}`}
      {...props}
    />
  );
}

function GroupFormFields({ slug, group, members = [] }: Props) {
  // Preserve the version and edits together when server props refresh.
  const [version] = useState(group?.version ?? 1);
  const [name, setName] = useState(group?.name ?? "");
  const [selected, setSelected] = useState(
    members.filter((member) => member.selected).map((member) => member.id),
  );
  const [state, action, pending] = useActionState(
    saveGroupAction.bind(null, slug, group?.id ?? null, version),
    { error: "", conflict: false },
  );
  return (
    <FormLayout action={action} width="narrow" aria-busy={pending}>
      <FormField
        id={group ? "group-name" : "new-group-name"}
        label="Group name"
      >
        <Input
          id={group ? "group-name" : "new-group-name"}
          name="name"
          required
          minLength={2}
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </FormField>
      {group && (
        <Section
          title="Group members"
          description="Select existing workspace members. Members can access a service if they belong to any of its selected groups. Owners and admins always retain access."
        >
          <Stack>
            {members.map((member) => (
              <CheckboxField
                key={member.id}
                name="memberIds"
                value={member.id}
                label={`${member.name} (${member.email})`}
                checked={selected.includes(member.id)}
                onCheckedChange={(checked) =>
                  setSelected((current) =>
                    checked
                      ? [...current, member.id]
                      : current.filter((id) => id !== member.id),
                  )
                }
              />
            ))}
            {!selected.length && (
              <Text size="sm" tone="muted">
                This group has no members. A service restricted to groups with
                no members is accessible only to owners and admins.
              </Text>
            )}
          </Stack>
        </Section>
      )}
      {state.error && <FormMessage tone="error">{state.error}</FormMessage>}
      {state.conflict && (
        <TextLink reloadDocument href={`/w/${slug}/groups/${group?.id}`}>
          Reload latest version
        </TextLink>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Saving group..." : group ? "Save group" : "Create group"}
      </Button>
    </FormLayout>
  );
}
