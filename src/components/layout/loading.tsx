import type { ReactNode } from "react";

export function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      aria-busy="true"
      className="flex min-w-0 flex-1 flex-col gap-8"
    >
      {children}
    </div>
  );
}
