import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { requireService } from "@/features/services/data";
import { ServiceDetails } from "@/features/services/components/ServiceDetails";

export default async function ServicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
}) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, repositories } = await requireService(
    workspaceSlug,
    serviceId,
  );
  const archived = service.archivedAt !== null;
  const manage = ["owner", "admin"].includes(workspace.role);
  return (
    <Page>
      <PageHeader
        title={service.name}
        back={
          <TextLink
            href={`/w/${workspace.slug}${archived ? "?status=archived" : ""}`}
          >
            Back to services
          </TextLink>
        }
      />
      <ServiceDetails
        slug={workspace.slug}
        service={service}
        repositories={repositories}
        manage={manage}
      />
    </Page>
  );
}
