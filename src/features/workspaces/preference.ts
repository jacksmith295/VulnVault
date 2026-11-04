import "server-only";

import { cookies } from "next/headers";
import { readServerEnv } from "@/lib/server/env";

export const workspaceCookie = "vv-workspace";

export function preferredWorkspaceId(value: string | undefined, userId: string) {
  if (!value || value.length > 500) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.length === 2 && parsed[0] === userId && typeof parsed[1] === "string") return parsed[1];
  } catch { /* Malformed preferences are ignored. */ }
  return undefined;
}

export async function rememberWorkspace(userId: string, workspaceId: string) {
  (await cookies()).set(workspaceCookie, JSON.stringify([userId, workspaceId]), {
    httpOnly: true, sameSite: "lax", secure: new URL(readServerEnv().BETTER_AUTH_URL).protocol === "https:",
    path: "/", maxAge: 60 * 60 * 24 * 365,
  });
}
