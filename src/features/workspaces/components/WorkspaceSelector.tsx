"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { Workspace } from "../data";
import { rememberWorkspaceAction } from "../actions";

export function WorkspaceSelector({ workspaces }: { workspaces: Workspace[] }) {
  const pathname = usePathname();
  const current = workspaces.find((workspace) => pathname === `/w/${workspace.slug}` || pathname.startsWith(`/w/${workspace.slug}/`));
  const slug = current?.slug;
  const dropdown = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (dropdown.current) dropdown.current.open = false;
    if (slug) void rememberWorkspaceAction(slug).catch(() => { /* Navigation remains usable if saving the preference fails. */ });
  }, [pathname, slug]);
  return <details ref={dropdown} className="relative">
    <summary className="cursor-pointer rounded-lg border px-4 py-2 font-medium">{current?.name ?? "Workspaces"}</summary>
    <nav aria-label="Workspace navigation" className="absolute left-0 mt-2 w-72 rounded-lg border bg-background p-2 shadow-lg">
      {workspaces.map((workspace) => <Link key={workspace.id} href={`/w/${workspace.slug}`} aria-current={current?.id === workspace.id ? "page" : undefined} className="block rounded px-3 py-2 hover:bg-muted">{workspace.name}{current?.id === workspace.id ? " (current)" : ""}</Link>)}
      <div className="mt-2 border-t pt-2">
        <Link className="block rounded px-3 py-2 hover:bg-muted" href="/workspaces/new">Create workspace +</Link>
        <Link className="block rounded px-3 py-2 hover:bg-muted" href="/workspaces">All workspaces</Link>
      </div>
    </nav>
  </details>;
}
