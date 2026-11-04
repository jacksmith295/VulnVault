import Link from "next/link";
import { listServices } from "@/features/services/data";

export default async function WorkspacePage({ params, searchParams }: { params: Promise<{ workspaceSlug: string }>; searchParams: Promise<{ status?: string }> }) {
  const { workspaceSlug } = await params;
  const archived = (await searchParams).status === "archived";
  const { workspace, services } = await listServices(workspaceSlug, archived);
  return <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
    <h1 className="text-3xl font-semibold">{workspace.name}</h1>
    <p className="text-sm text-muted-foreground">Your role: {workspace.role}</p>
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="text-xl font-semibold">{archived ? "Archived services" : "Services"}</h2>
      {["owner", "admin"].includes(workspace.role) && <Link className="text-sm underline" href={`/w/${workspace.slug}/services/new`}>Create service</Link>}</div>
    <nav className="flex gap-4 text-sm" aria-label="Service status"><Link aria-current={!archived ? "page" : undefined} className="underline" href={`/w/${workspace.slug}`}>Active services</Link><Link aria-current={archived ? "page" : undefined} className="underline" href={`/w/${workspace.slug}?status=archived`}>Archived services</Link></nav>
    {services.length ? <ul className="divide-y rounded-lg border">{services.map((service) => <li key={service.id} className="p-5"><Link className="font-medium underline" href={`/w/${workspace.slug}/services/${service.id}`}>{service.name}</Link>{service.description && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-muted-foreground">{service.description}</p>}</li>)}</ul>
      : <section className="space-y-2 rounded-lg border p-6"><h3 className="font-semibold">{archived ? "No archived services" : "No services yet"}</h3><p className="text-muted-foreground">{archived ? "Archived services will appear here." : "Add a service to start tracking its repositories."}</p></section>}
  </main>;
}
