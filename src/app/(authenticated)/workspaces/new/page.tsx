import { Page, PageHeader } from "@/components/layout";
import { CreateWorkspaceForm } from "@/features/workspaces/components/CreateWorkspaceForm";
import { requireSession } from "@/lib/auth-session";

export default async function NewWorkspacePage() {
  await requireSession();
  return (
    <Page>
      <PageHeader
        title="Create workspace"
        description="Bring your services and findings together. You will be the workspace owner."
      />
      <CreateWorkspaceForm />
    </Page>
  );
}
