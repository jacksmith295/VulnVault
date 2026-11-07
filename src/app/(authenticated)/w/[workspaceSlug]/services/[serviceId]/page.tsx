import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { FormMessage } from "@/components/ui/form-message";
import { listFindings } from "@/features/findings/data";
import { parseFindingFilters } from "@/features/findings/filter-validation";
import { FindingFiltersForm } from "@/features/findings/components/FindingBoardFilters";
import { FindingsList } from "@/features/findings/components/FindingsList";
import { FindingsListSkeleton } from "@/features/findings/components/FindingsListSkeleton";
import { ServiceDetails } from "@/features/services/components/ServiceDetails";
import { requireService } from "@/features/services/data";

type Query = Record<string, string | string[] | undefined>;
export const metadata: Metadata = { title: "Service details" };

export default async function ServicePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
  searchParams: Promise<Query>;
}) {
  const { workspaceSlug, serviceId } = await params;
  const { workspace, service, repositories } = await requireService(
    workspaceSlug,
    serviceId,
  );
  const query = await searchParams;
  const archived = service.archivedAt !== null;
  const manage = ["owner", "admin"].includes(workspace.role);
  const navigationKey = JSON.stringify(Object.entries(query).sort());
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
      <Section title="Findings">
        <Stack>
          {archived ? (
            <Text tone="muted">
              Restore this service before creating or editing findings.
            </Text>
          ) : (
            <TextLink
              href={`/w/${workspace.slug}/services/${service.id}/findings/new`}
            >
              Create finding
            </TextLink>
          )}
          <FindingFiltersForm
            slug={workspaceSlug}
            serviceId={serviceId}
            navigationKey={navigationKey}
            filters={parseFindingFilters(query).filters}
          />
          <Suspense key={navigationKey} fallback={<FindingsListSkeleton />}>
            <FindingResults
              slug={workspaceSlug}
              serviceId={serviceId}
              query={query}
            />
          </Suspense>
        </Stack>
      </Section>
    </Page>
  );
}

async function FindingResults({
  slug,
  serviceId,
  query,
}: {
  slug: string;
  serviceId: string;
  query: Query;
}) {
  const result = await listFindings(slug, serviceId, query);
  return result.filterError ? (
    <FormMessage>{result.filterError}</FormMessage>
  ) : (
    <FindingsList
      key={`${result.scopeKey}:${result.revisionKey}`}
      slug={slug}
      serviceId={serviceId}
      findings={result.findings}
      total={result.total}
      nextCursor={result.nextCursor}
      scopeKey={result.scopeKey}
      filters={result.filters}
    />
  );
}
