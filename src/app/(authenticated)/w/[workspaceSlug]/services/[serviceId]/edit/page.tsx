import Link from "next/link";
import { notFound } from "next/navigation";
import { requireService } from "@/features/services/data";
import { ServiceForm } from "@/features/services/components/ServiceForm";

export default async function EditServicePage({ params }: { params: Promise<{ workspaceSlug: string; serviceId: string }> }) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, repositories } = await requireService(workspaceSlug, serviceId);
  if (!["owner", "admin"].includes(workspace.role)) notFound();
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12"><Link className="text-sm underline" href={`/w/${workspace.slug}/services/${service.id}`}>Back to service</Link><h1 className="text-3xl font-semibold">Edit service</h1>
    {service.archivedAt ? <p>Restore this service from its detail page before editing.</p> : <ServiceForm slug={workspace.slug} service={{ ...service, repositoryUrls: repositories.map((repository) => repository.url) }} />}</main>;
}
