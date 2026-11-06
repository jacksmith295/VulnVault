import { Inline, ItemList, ListItem, Stack } from "@/components/layout";
import { Badge } from "@/components/ui/badge";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";

export function GroupList({
  slug,
  groups,
}: {
  slug: string;
  groups: {
    id: string;
    name: string;
    isDefault: boolean;
    memberCount: number;
    serviceCount: number;
  }[];
}) {
  return (
    <ItemList layout="grid" density="compact">
      {groups.map((group) => (
        <ListItem density="compact" key={group.id}>
          <Stack gap="sm">
            <TextLink href={`/w/${slug}/groups/${group.id}`}>
              {group.name}
            </TextLink>
            {group.isDefault && (
              <Inline>
                <Badge tone="muted">Default group</Badge>
              </Inline>
            )}
            <Text size="sm" tone="muted">
              {group.memberCount} members · {group.serviceCount} services
            </Text>
            {group.isDefault && (
              <Text size="sm" tone="muted">
                Includes every workspace member automatically.
              </Text>
            )}
          </Stack>
        </ListItem>
      ))}
    </ItemList>
  );
}
