import { requireWorkspace } from "@/features/workspaces/data";

export default async function WorkspacePage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug);
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
    <h1 className="text-3xl font-semibold">{workspace.name}</h1>
    <p className="text-sm text-muted-foreground">Your role: {workspace.role}</p>
    <section className="space-y-2 rounded-lg border p-6">
      <h2 className="text-xl font-semibold">No services yet</h2>
      <p className="text-muted-foreground">Service and finding management will be available in a future update.</p>
    </section>
  </main>;
}
