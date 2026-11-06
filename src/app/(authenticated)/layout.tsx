import type { ReactNode } from "react";
import { AppShell } from "@/components/layout";

import { SessionMonitor } from "@/features/auth/components/SessionMonitor";
import { AppHeader } from "@/components/layout/AppHeader";
import { listWorkspaces } from "@/features/workspaces/data";
import { requireSession } from "@/lib/auth-session";

type AuthenticatedLayoutProps = {
  children: ReactNode;
};

export default async function AuthenticatedLayout({
  children,
}: AuthenticatedLayoutProps) {
  await requireSession();
  const workspaces = await listWorkspaces();
  return (
    <AppShell>
      <SessionMonitor />
      <AppHeader workspaces={workspaces} />
      {children}
    </AppShell>
  );
}
