import type { ReactNode } from "react";

import { SessionMonitor } from "@/features/auth/components/SessionMonitor";
import { WorkspaceHeader } from "@/features/workspaces/components/WorkspaceHeader";
import { listWorkspaces } from "@/features/workspaces/data";
import { requireSession } from "@/lib/auth-session";

type AuthenticatedLayoutProps = {
  children: ReactNode;
};

export default async function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  await requireSession();
  const workspaces = await listWorkspaces();
  return (
    <>
      <SessionMonitor />
      <WorkspaceHeader workspaces={workspaces} />
      {children}
    </>
  );
}
