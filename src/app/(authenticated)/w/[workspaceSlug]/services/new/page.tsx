import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { requireWorkspace } from "@/features/workspaces/data";
import { ServiceForm } from "@/features/services/components/ServiceForm";

export default async function NewServicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug, ["owner", "admin"]);
  return (
    <Page>
      <PageHeader
        title="Create service"
        back={
          <TextLink href={`/w/${workspace.slug}`}>Back to services</TextLink>
        }
      />
      <ServiceForm slug={workspace.slug} />
    </Page>
  );
}
