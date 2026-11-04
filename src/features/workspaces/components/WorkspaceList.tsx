import { EmptyState, ItemList, ListItem, Stack } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import type { Workspace } from "../data";

export function WorkspaceList({ workspaces }: { workspaces: Workspace[] }) {
  if (!workspaces.length)
    return (
      <EmptyState
        title="No workspaces yet"
        description="You do not belong to a workspace yet."
      />
    );
  return (
    <ItemList>
      {workspaces.map((workspace) => (
        <ListItem key={workspace.id}>
          <Stack gap="sm">
            <TextLink href={`/w/${workspace.slug}`}>{workspace.name}</TextLink>
            <Text size="sm" tone="muted">
              Your role: {workspace.role}
            </Text>
          </Stack>
        </ListItem>
      ))}
    </ItemList>
  );
}
