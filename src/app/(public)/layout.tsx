import type { ReactNode } from "react";
import { PublicShell } from "@/components/layout";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return <PublicShell>{children}</PublicShell>;
}
