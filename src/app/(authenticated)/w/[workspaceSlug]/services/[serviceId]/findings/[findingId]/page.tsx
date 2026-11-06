import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { requireFinding } from "@/features/findings/data";
import { FindingDetails } from "@/features/findings/components/FindingDetails";
export const metadata: Metadata = { title: "Finding details" };

export default async function FindingPage({
  params,
}: {
  params: Promise<{
    workspaceSlug: string;
    serviceId: string;
    findingId: string;
  }>;
}) {
  const { workspaceSlug, serviceId, findingId } = await params;
  const { workspace, service, finding, references, source } =
    await requireFinding(workspaceSlug, serviceId, findingId);
  return (
    <Page width="readable">
      <PageHeader
        title={finding.title}
        description={service.name}
        back={
          <TextLink href={`/w/${workspace.slug}/services/${service.id}`}>
            Back to service
          </TextLink>
        }
      />
      <FindingDetails
        slug={workspace.slug}
        serviceId={service.id}
        finding={finding}
        references={references}
        source={source}
        archived={service.archivedAt !== null}
      />
    </Page>
  );
}
