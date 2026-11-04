import { Page, PageHeader } from "@/components/layout";
import { AppLink } from "@/components/ui/link";
import { WorkspaceList } from "@/features/workspaces/components/WorkspaceList";
import { listWorkspaces } from "@/features/workspaces/data";

export default async function WorkspacesPage() {
  const workspaces = await listWorkspaces();
  return (
    <Page>
      <PageHeader
        title="All workspaces"
        actions={<AppLink href="/workspaces/new">Create workspace</AppLink>}
      />
      <WorkspaceList workspaces={workspaces} />
    </Page>
  );
}
