"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import {
  Menu,
  MenuTrigger,
  MenuPopup,
  MenuLink,
  MenuSeparator,
} from "@/components/ui/menu";
import type { Workspace } from "../data";
import { rememberWorkspaceAction } from "../actions";

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

  useEffect(() => {
    if (slug)
      void rememberWorkspaceAction(slug).catch(() => {
        /* Navigation remains usable if saving the preference fails. */
      });
  }, [pathname, slug]);

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
