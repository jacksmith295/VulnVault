import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { listFindings } from "@/features/findings/data";
import { FindingsList } from "@/features/findings/components/FindingsList";
import { ServiceDetails } from "@/features/services/components/ServiceDetails";

export const metadata: Metadata = { title: "Service details" };

export default async function ServicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
}) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, repositories, findings } = await listFindings(
    workspaceSlug,
    serviceId,
  );
  const archived = service.archivedAt !== null;
  const manage = ["owner", "admin"].includes(workspace.role);
  return (
    <Page width="readable">
      <PageHeader
        title={service.name}
        back={
          <TextLink
            href={`/w/${workspace.slug}/services${archived ? "?status=archived" : ""}`}
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
      <FindingsList
        slug={workspace.slug}
        serviceId={service.id}
        findings={findings}
        archived={archived}
      />
    </Page>
  );
}
