import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { listWorkspaces } from "@/features/workspaces/data";
import { preferredWorkspaceId, workspaceCookie } from "@/features/workspaces/preference";
import { requireSession } from "@/lib/auth-session";

export default async function DashboardPage() {
  const { user } = await requireSession();

  const workspaces = await listWorkspaces();
  const preferredId = preferredWorkspaceId((await cookies()).get(workspaceCookie)?.value, user.id);
  const selected = workspaces.find((workspace) => workspace.id === preferredId) ?? workspaces[0];
  if (selected) redirect(`/w/${selected.slug}`);

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">VulnVault</p>
          <h1 className="text-3xl font-semibold">Welcome, {user.name}</h1>
          <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        </div>

      </header>
      <Card>
        <CardHeader>
          <CardTitle><h2>Your account is ready</h2></CardTitle>
          <CardDescription>You have verified your email and signed in successfully.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Create a workspace to get started. Joining by invitation will be available in a future update.</p>
          <Link href="/workspaces/new" className="mt-4 inline-block font-medium underline">Create workspace</Link>
        </CardContent>
      </Card>
    </main>
  );
}
