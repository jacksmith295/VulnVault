"use client";

import { useEffect, useRef } from "react";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
import { LogoutButton } from "@/features/auth/components/LogoutButton";
import { WorkspaceSelector } from "@/features/workspaces/components/WorkspaceSelector";
import type { Workspace } from "@/features/workspaces/data";
import { SkipLink } from "./skip-link";

export function AppHeader({ workspaces }: { workspaces: Workspace[] }) {
  const headerRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    // Text resizing can wrap the toolbar. Scroll clearance must follow its height.
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty(
        "--app-header-height",
        `${header.getBoundingClientRect().height}px`,
      );
    });
    observer.observe(header);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty("--app-header-height");
    };
  }, []);
  return (
    <header
      ref={headerRef}
      className="sticky top-0 z-20 border-b bg-card px-4 py-4 sm:px-6"
    >
      <SkipLink />
      <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 max-w-full flex-[1_1_6rem]">
          <WorkspaceSelector workspaces={workspaces} />
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-2">
          <ThemeSelector />
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}
