import { CreateWorkspaceForm } from "@/features/workspaces/components/CreateWorkspaceForm";
import { requireSession } from "@/lib/auth-session";

export default async function NewWorkspacePage() {
  await requireSession();
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
    <h1 className="text-3xl font-semibold">Create workspace</h1>
    <p className="text-muted-foreground">Bring your services and findings together. You will be the workspace owner.</p>
    <CreateWorkspaceForm />
  </main>;
}
