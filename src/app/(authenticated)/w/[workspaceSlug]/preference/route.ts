import { type NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/features/workspaces/data";
import { rememberWorkspace } from "@/features/workspaces/preference";
import { requireSession } from "@/lib/auth-session";
import { readServerEnv } from "@/lib/server/env";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceSlug: string }> },
) {
  if (
    request.headers.get("origin") !==
    new URL(readServerEnv().BETTER_AUTH_URL).origin
  ) {
    return new NextResponse(null, { status: 403 });
  }
  const { workspaceSlug } = await params;
  const workspace = await requireWorkspace(workspaceSlug);
  const { user } = await requireSession();
  await rememberWorkspace(user.id, workspace.id);
  return new NextResponse(null, {
    status: 204,
    headers: { "Cache-Control": "private, no-store" },
  });
}
