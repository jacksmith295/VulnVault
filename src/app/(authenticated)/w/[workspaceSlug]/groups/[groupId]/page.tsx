import type { Metadata } from "next";
import { Page, PageHeader, Section } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { GroupForm } from "@/features/groups/components/GroupForm";
import { requireGroup } from "@/features/groups/data";

export const metadata: Metadata = { title: "Group details" };

export default async function GroupPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; groupId: string }>;
}) {
  const { workspaceSlug, groupId } = await params;
  const { workspace, group, members } = await requireGroup(
    workspaceSlug,
    groupId,
  );
  return (
    <Page width="narrow">
      <PageHeader
        title={group.name}
        back={
          <TextLink href={`/w/${workspace.slug}/groups`}>
            Back to groups
          </TextLink>
        }
      />
      {group.isDefault ? (
        <Section title="Default group">
          <Text>
            Everyone automatically includes every workspace member. Its name and
            membership cannot be changed.
          </Text>
        </Section>
      ) : (
        <GroupForm slug={workspace.slug} group={group} members={members} />
      )}
    </Page>
  );
}
