import { Suspense } from "react";
import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { LoadingRegion } from "@/components/layout/loading";
import { TextLink } from "@/components/ui/link";
import { Skeleton } from "@/components/ui/skeleton";
import { isGithubConfigured } from "@/features/integrations/config";
import { getIntegrationPageData } from "@/features/integrations/data";
import { IntegrationList } from "@/features/integrations/components/IntegrationList";
import { requireWorkspace } from "@/features/workspaces/data";

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug, ["owner", "admin"]);
  return (
    <Page>
      <PageHeader
        title="Integrations"
        description={workspace.name}
        back={
          <TextLink href={`/w/${workspace.slug}`}>Back to workspace</TextLink>
        }
      />
      <Suspense fallback={<IntegrationSkeleton />}>
        <IntegrationContent slug={workspaceSlug} />
      </Suspense>
    </Page>
  );
}

async function IntegrationContent({ slug }: { slug: string }) {
  const data = await getIntegrationPageData(slug);
  return <IntegrationList data={data} configured={isGithubConfigured()} />;
}

function IntegrationSkeleton() {
  return (
    <LoadingRegion label="Loading integrations">
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
          <Skeleton size="control" />
          <Skeleton size="control" />
          <Skeleton size="control" />
        </Stack>
      </Section>
    </LoadingRegion>
  );
}
