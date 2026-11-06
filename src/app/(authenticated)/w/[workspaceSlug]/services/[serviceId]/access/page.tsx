import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { ServiceAccessForm } from "@/features/groups/components/ServiceAccessForm";
import { getServiceAccess } from "@/features/groups/data";

export default async function ServiceAccessPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
}) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, groups, selectedGroupIds } =
    await getServiceAccess(workspaceSlug, serviceId);
  return (
    <Page width="narrow">
      <PageHeader
        title="Service access"
        description={service.name}
        back={
          <TextLink href={`/w/${workspace.slug}/services/${service.id}`}>
            Back to service
          </TextLink>
        }
      />
      <ServiceAccessForm
        slug={workspace.slug}
        service={service}
        groups={groups}
        selectedGroupIds={selectedGroupIds}
      />
    </Page>
  );
}
