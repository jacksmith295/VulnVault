import type { ReactNode } from "react";

type PublicLayoutProps = {
  children: ReactNode;
};

export default function PublicLayout({ children }: PublicLayoutProps) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      {children}
    </main>
  );
}
