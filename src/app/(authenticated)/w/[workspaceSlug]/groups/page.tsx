import { Page, PageHeader, Section } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { GroupForm } from "@/features/groups/components/GroupForm";
import { GroupList } from "@/features/groups/components/GroupList";
import { listGroups } from "@/features/groups/data";

export default async function GroupsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const { workspace, groups } = await listGroups(workspaceSlug);
  return (
    <Page>
      <PageHeader
        title="Groups"
        description="Manage service access through groups of workspace members."
        back={<TextLink href={`/w/${workspace.slug}`}>Back to board</TextLink>}
      />
      <GroupList slug={workspace.slug} groups={groups} />
      <Section
        title="Create group"
        description="Create a custom group, then select its members. New groups begin with no members."
      >
        <GroupForm slug={workspace.slug} />
      </Section>
    </Page>
  );
}
