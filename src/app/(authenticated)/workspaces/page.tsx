import Link from "next/link";
import { listWorkspaces } from "@/features/workspaces/data";

export default async function WorkspacesPage() {
  const workspaces = await listWorkspaces();
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
    <h1 className="text-3xl font-semibold">All workspaces</h1>
    {workspaces.length ? <ul className="space-y-3">{workspaces.map((workspace) => <li key={workspace.id} className="rounded-lg border p-4">
      <Link href={`/w/${workspace.slug}`} className="font-medium underline">{workspace.name}</Link>
      <p className="text-sm text-muted-foreground">Your role: {workspace.role}</p>
    </li>)}</ul> : <p>You do not belong to a workspace yet.</p>}
    <Link href="/workspaces/new" className="inline-block font-medium underline">Create workspace</Link>
  </main>;
}
