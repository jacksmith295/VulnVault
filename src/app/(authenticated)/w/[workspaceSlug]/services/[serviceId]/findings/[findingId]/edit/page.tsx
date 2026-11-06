import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { requireFinding } from "@/features/findings/data";
import { FindingForm } from "@/features/findings/components/FindingForm";
export default async function EditFindingPage({
  params,
}: {
  params: Promise<{
    workspaceSlug: string;
    serviceId: string;
    findingId: string;
  }>;
}) {
  const { workspaceSlug, serviceId, findingId } = await params;
  const { workspace, service, finding, references } = await requireFinding(
    workspaceSlug,
    serviceId,
    findingId,
  );
  return (
    <Page width="narrow">
      <PageHeader
        title="Edit finding"
        description={service.name}
        back={
          <TextLink
            href={`/w/${workspace.slug}/services/${service.id}/findings/${finding.id}`}
          >
            Back to finding
          </TextLink>
        }
      />
      {service.archivedAt ? (
        <Text>
          Restore this service from its detail page before creating or editing
          findings.
        </Text>
      ) : (
        <FindingForm
          slug={workspace.slug}
          serviceId={service.id}
          finding={{
            ...finding,
            referenceUrls: references.map((reference) => reference.url),
          }}
        />
      )}
    </Page>
  );
}
