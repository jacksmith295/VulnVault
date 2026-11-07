import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { LoadingRegion } from "@/components/layout/loading";
import { TextLink } from "@/components/ui/link";
import { Skeleton } from "@/components/ui/skeleton";
import { isGithubConfigured } from "@/features/integrations/config";
import { getServiceIntegrationPageData } from "@/features/integrations/data";
import { ServiceIntegrationList } from "@/features/integrations/components/ServiceIntegrationList";
import { requireWorkspace } from "@/features/workspaces/data";

export const metadata: Metadata = { title: "Service integrations" };

export default async function ServiceIntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string; serviceId: string }>;
}) {
  const { workspaceSlug, serviceId } = await params;
  await requireWorkspace(workspaceSlug, ["owner", "admin"]);
  return (
    <Page width="readable">
      <Suspense fallback={<ServiceIntegrationSkeleton />}>
        <ServiceIntegrationContent slug={workspaceSlug} serviceId={serviceId} />
      </Suspense>
    </Page>
  );
}

async function ServiceIntegrationContent({
  slug,
  serviceId,
}: {
  slug: string;
  serviceId: string;
}) {
  const data = await getServiceIntegrationPageData(slug, serviceId);
  return (
    <>
      <PageHeader
        title="Integrations"
        description={data.service.name}
        back={
          <TextLink
            href={`/w/${data.workspace.slug}/services/${data.service.id}`}
          >
            Back to service
          </TextLink>
        }
      />
      <ServiceIntegrationList data={data} configured={isGithubConfigured()} />
    </>
  );
}

function ServiceIntegrationSkeleton() {
  return (
    <LoadingRegion label="Loading service integrations">
      <Stack>
        <Skeleton size="label" />
        <Skeleton size="label" />
        <Skeleton size="label" />
      </Stack>
      <Section>
        <Stack>
          <Skeleton size="label" />
          <Skeleton />
          <Skeleton />
          <Skeleton size="control" />
        </Stack>
      </Section>
      <Section>
        <Stack>
          <Skeleton size="label" />
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton size="control" />
          <Skeleton size="control" />
        </Stack>
      </Section>
    </LoadingRegion>
  );
}
