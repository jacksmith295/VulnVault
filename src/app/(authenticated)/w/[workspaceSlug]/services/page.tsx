import type { Metadata } from "next";
import { Inline, Page, PageHeader, Stack, TabNav } from "@/components/layout";
import { AppLink, TabNavLink } from "@/components/ui/link";
import { Heading } from "@/components/ui/typography";
import { ServiceList } from "@/features/services/components/ServiceList";
import { listServices } from "@/features/services/data";

export const metadata: Metadata = { title: "Services" };

export default async function ServicesPage({
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
        title="Services"
        description={`Your role: ${workspace.role}`}
        actions={
          <Inline>
            <AppLink href={`/w/${workspace.slug}`}>Board</AppLink>
            {["owner", "admin"].includes(workspace.role) && (
              <AppLink href={`/w/${workspace.slug}/groups`}>Groups</AppLink>
            )}
          </Inline>
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
          <TabNavLink
            current={!archived}
            href={`/w/${workspace.slug}/services`}
          >
            Active services
          </TabNavLink>
          <TabNavLink
            current={archived}
            href={`/w/${workspace.slug}/services?status=archived`}
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
