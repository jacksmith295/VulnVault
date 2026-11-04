import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { WorkspaceSelector } from "@/features/workspaces/components/WorkspaceSelector";
import type { Workspace } from "@/features/workspaces/data";

export function AppHeader({ workspaces }: { workspaces: Workspace[] }) {
  return <header className="sticky top-0 z-20 border-b bg-background px-6 py-4">
    <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
      <WorkspaceSelector workspaces={workspaces} />
      <LogoutButton />
    </div>
  </header>;
}
