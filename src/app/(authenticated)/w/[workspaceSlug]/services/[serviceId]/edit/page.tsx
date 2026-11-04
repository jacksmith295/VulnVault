import { notFound } from "next/navigation";
import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { requireService } from "@/features/services/data";
import { ServiceForm } from "@/features/services/components/ServiceForm";

export default async function EditServicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
}) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, repositories } = await requireService(
    workspaceSlug,
    serviceId,
  );
  if (!["owner", "admin"].includes(workspace.role)) notFound();
  return (
    <Page>
      <PageHeader
        title="Edit service"
        back={
          <TextLink href={`/w/${workspace.slug}/services/${service.id}`}>
            Back to service
          </TextLink>
        }
      />
      {service.archivedAt ? (
        <Text>Restore this service from its detail page before editing.</Text>
      ) : (
        <ServiceForm
          slug={workspace.slug}
          service={{
            ...service,
            repositoryUrls: repositories.map((repository) => repository.url),
          }}
        />
      )}
    </Page>
  );
}
