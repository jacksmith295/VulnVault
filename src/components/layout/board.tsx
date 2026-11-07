import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BoardSpace({ children }: { children: ReactNode }) {
  return <div className="min-h-80 flex-1">{children}</div>;
}

export function FilterGrid({
  children,
  layout = "board",
}: {
  children: ReactNode;
  layout?: "board" | "service";
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-4 lg:items-end lg:gap-3",
        layout === "board" ? "lg:grid-cols-5" : "lg:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

export function BoardFilterForm(props: ComponentProps<"form">) {
  return <form className="min-w-0 rounded-xl border bg-card p-4" {...props} />;
}

export function BoardFilterActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-(--control-height) flex-wrap items-center gap-3">
      {children}
    </div>
  );
}

export function DesktopFilters({ children }: { children: ReactNode }) {
  return <div className="hidden min-w-0 lg:block">{children}</div>;
}

export function MobileFilters({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-(--control-height) items-center lg:hidden">
      {children}
    </div>
  );
}
