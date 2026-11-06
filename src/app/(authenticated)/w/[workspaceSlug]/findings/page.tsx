import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireWorkspace } from "@/features/workspaces/data";

export const metadata: Metadata = { title: "Findings" };

export default async function WorkspaceFindingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug);
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, item);
    } else if (value !== undefined) {
      query.append(key, value);
    }
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  redirect(`/w/${workspace.slug}${suffix}`);
}
