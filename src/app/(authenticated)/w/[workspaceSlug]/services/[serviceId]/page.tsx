import Link from "next/link";
import { requireService } from "@/features/services/data";
import { ArchiveServiceForm } from "@/features/services/components/ArchiveServiceForm";

export default async function ServicePage({ params }: { params: Promise<{ workspaceSlug: string; serviceId: string }> }) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, repositories } = await requireService(workspaceSlug, serviceId);
  const archived = service.archivedAt !== null;
  const manage = ["owner", "admin"].includes(workspace.role);
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
    <Link className="text-sm underline" href={`/w/${workspace.slug}${archived ? "?status=archived" : ""}`}>Back to services</Link>
    <h1 className="break-words text-3xl font-semibold">{service.name}</h1>
    <p className="text-sm text-muted-foreground">Status: {archived ? "Archived" : "Active"}</p>
    <section className="space-y-2"><h2 className="text-xl font-semibold">Description</h2><p className="whitespace-pre-wrap break-words">{service.description || "No description provided."}</p></section>
    <section className="space-y-2"><h2 className="text-xl font-semibold">Repositories</h2>{repositories.length ? <ul className="space-y-2">{repositories.map((repository) => <li key={repository.id}><a className="break-all underline" href={repository.url} target="_blank" rel="noopener noreferrer">{repository.url}</a></li>)}</ul> : <p className="text-muted-foreground">No repositories added.</p>}</section>
    <p className="text-sm text-muted-foreground">Updated {service.updatedAt.toISOString()}</p>
    {manage && <>{!archived && <Link className="inline-block underline" href={`/w/${workspace.slug}/services/${service.id}/edit`}>Edit service</Link>}<ArchiveServiceForm slug={workspace.slug} id={service.id} version={service.version} archived={archived} /></>}
  </main>;
}
