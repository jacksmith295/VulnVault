import type { ReactNode } from "react";

import { requireSession } from "@/lib/auth-session";

type AuthenticatedLayoutProps = {
  children: ReactNode;
};

export default async function AuthenticatedLayout({ children }: AuthenticatedLayoutProps) {
  await requireSession();
  return children;
}
