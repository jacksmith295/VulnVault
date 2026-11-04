import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { requireSession } from "@/lib/auth-session";

export default async function DashboardPage() {
  const { user } = await requireSession();

  return (
    <main className="mx-auto min-h-screen max-w-4xl space-y-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">VulnVault</p>
          <h1 className="text-3xl font-semibold">Welcome, {user.name}</h1>
          <p className="text-sm text-muted-foreground">Signed in as {user.email}</p>
        </div>
        <LogoutButton />
      </header>
      <Card>
        <CardHeader>
          <CardTitle><h2>Your account is ready</h2></CardTitle>
          <CardDescription>You have verified your email and signed in successfully.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Workspace setup is not available yet. Soon you can create a workspace for your projects or join one by invitation.</p>
        </CardContent>
      </Card>
    </main>
  );
}
