import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { WorkspaceSelector } from "@/features/workspaces/components/WorkspaceSelector";
import type { Workspace } from "@/features/workspaces/data";

export function AppHeader({ workspaces }: { workspaces: Workspace[] }) {
  return (
    <header className="sticky top-0 z-20 border-b bg-card px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <WorkspaceSelector workspaces={workspaces} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <ThemeSelector />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
