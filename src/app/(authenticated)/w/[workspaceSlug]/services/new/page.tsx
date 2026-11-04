import Link from "next/link";
import { requireWorkspace } from "@/features/workspaces/data";
import { ServiceForm } from "@/features/services/components/ServiceForm";

export default async function NewServicePage({ params }: { params: Promise<{ workspaceSlug: string }> }) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug, ["owner", "admin"]);
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12"><Link className="text-sm underline" href={`/w/${workspace.slug}`}>Back to services</Link><h1 className="text-3xl font-semibold">Create service</h1><ServiceForm slug={workspace.slug} /></main>;
}
