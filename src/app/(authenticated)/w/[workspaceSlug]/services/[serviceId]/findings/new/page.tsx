import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { requireService } from "@/features/services/data";
import { FindingForm } from "@/features/findings/components/FindingForm";
export const metadata: Metadata = { title: "Create finding" };

export default async function NewFindingPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
}) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service } = await requireService(workspaceSlug, serviceId);
  return (
    <Page width="narrow">
      <PageHeader
        title="Create finding"
        description={service.name}
        back={
          <TextLink href={`/w/${workspace.slug}/services/${service.id}`}>
            Back to service
          </TextLink>
        }
      />
      {service.archivedAt ? (
        <Text>
          Restore this service from its detail page before creating or editing
          findings.
        </Text>
      ) : (
        <FindingForm slug={workspace.slug} serviceId={service.id} />
      )}
    </Page>
  );
}
