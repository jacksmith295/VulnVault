"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuLink,
  MenuSeparator,
} from "@/components/ui/menu";
import type { Workspace } from "../data";

export function WorkspaceSelector({ workspaces }: { workspaces: Workspace[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const route = `${pathname}?${searchParams.toString()}`;
  const current = workspaces.find(
    (workspace) =>
      pathname === `/w/${workspace.slug}` ||
      pathname.startsWith(`/w/${workspace.slug}/`),
  );
  const slug = current?.slug;
  const preferenceQueue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let canceled = false;
    if (slug) {
      // Complete earlier writes first so their cookies cannot replace a newer choice.
      preferenceQueue.current = preferenceQueue.current.then(async () => {
        if (canceled) return;
        try {
          await fetch(`/w/${slug}/preference`, {
            method: "POST",
            cache: "no-store",
          });
        } catch {
          /* Navigation remains usable if saving the preference fails. */
        }
      });
    }
    return () => {
      canceled = true;
    };
  }, [slug]);

  return (
    <Menu key={route}>
      <MenuTrigger aria-label="Switch workspace">
        {current?.name ?? "Workspaces"}
      </MenuTrigger>
      <MenuPopup>
        {workspaces.map((workspace) => (
          <MenuLink
            key={workspace.id}
            href={`/w/${workspace.slug}`}
            current={current?.id === workspace.id}
          >
            {workspace.name}
          </MenuLink>
        ))}
        <MenuSeparator />
        <MenuLink href="/workspaces/new">Create workspace +</MenuLink>
        <MenuLink href="/workspaces">All workspaces</MenuLink>
      </MenuPopup>
    </Menu>
  );
}
