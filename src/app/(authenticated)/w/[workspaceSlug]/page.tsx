import { Inline, Page, PageHeader, Stack, TabNav } from "@/components/layout";
import { AppLink, TabNavLink } from "@/components/ui/link";
import { Heading } from "@/components/ui/typography";
import { ServiceList } from "@/features/services/components/ServiceList";
import { listServices } from "@/features/services/data";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { workspaceSlug } = await params;
  const archived = (await searchParams).status === "archived";
  const { workspace, services } = await listServices(workspaceSlug, archived);
  return (
    <Page>
      <PageHeader
        title={workspace.name}
        description={`Your role: ${workspace.role}`}
        actions={
          ["owner", "admin"].includes(workspace.role) && (
            <AppLink href={`/w/${workspace.slug}/groups`}>Groups</AppLink>
          )
        }
      />
      <Stack>
        <Inline justify="between">
          <Heading level={2}>
            {archived ? "Archived services" : "Services"}
          </Heading>
          {["owner", "admin"].includes(workspace.role) && (
            <AppLink href={`/w/${workspace.slug}/services/new`}>
              Create service
            </AppLink>
          )}
        </Inline>
        <TabNav>
          <TabNavLink current={!archived} href={`/w/${workspace.slug}`}>
            Active services
          </TabNavLink>
          <TabNavLink
            current={archived}
            href={`/w/${workspace.slug}?status=archived`}
          >
            Archived services
          </TabNavLink>
        </TabNav>
        <ServiceList
          slug={workspace.slug}
          services={services}
          archived={archived}
        />
      </Stack>
    </Page>
  );
}
