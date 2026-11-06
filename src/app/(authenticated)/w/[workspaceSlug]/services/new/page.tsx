import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout";
import { TextLink } from "@/components/ui/link";
import { requireWorkspace } from "@/features/workspaces/data";
import { ServiceForm } from "@/features/services/components/ServiceForm";

export const metadata: Metadata = { title: "Create service" };

export default async function NewServicePage({
  params,
}: {
  params: Promise<{ workspaceSlug: string }>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug, ["owner", "admin"]);
  return (
    <Page width="narrow">
      <PageHeader
        title="Create service"
        back={
          <TextLink href={`/w/${workspace.slug}/services`}>
            Back to services
          </TextLink>
        }
      />
      <ServiceForm slug={workspace.slug} />
    </Page>
  );
}
