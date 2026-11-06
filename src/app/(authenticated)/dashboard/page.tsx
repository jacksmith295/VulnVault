import type { Metadata } from "next";
import { Page, PageHeader, Section, Stack } from "@/components/layout";
import { AppLink } from "@/components/ui/link";
import { Text } from "@/components/ui/typography";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listWorkspaces } from "@/features/workspaces/data";
import {
  preferredWorkspaceId,
  workspaceCookie,
} from "@/features/workspaces/preference";
import { requireSession } from "@/lib/auth-session";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { user } = await requireSession();

  const workspaces = await listWorkspaces();
  const preferredId = preferredWorkspaceId(
    (await cookies()).get(workspaceCookie)?.value,
    user.id,
  );
  const selected =
    workspaces.find((workspace) => workspace.id === preferredId) ??
    workspaces[0];
  if (selected) redirect(`/w/${selected.slug}`);

  return (
    <Page>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={`Signed in as ${user.email}`}
      />
      <Section
        title="Your account is ready"
        description="You have verified your email and signed in successfully."
      >
        <Stack>
          <Text tone="muted">
            Create a workspace to get started. Joining by invitation will be
            available in a future update.
          </Text>
          <AppLink href="/workspaces/new">Create workspace</AppLink>
        </Stack>
      </Section>
    </Page>
  );
}
