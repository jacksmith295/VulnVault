"use client";

import { Tabs } from "@base-ui/react/tabs";
import { useSyncExternalStore, type ReactNode } from "react";
import { Heading } from "@/components/ui/typography";

const desktopQuery = "(min-width: 768px)";
function subscribe(callback: () => void) {
  const media = window.matchMedia(desktopQuery);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

export function StatusBoard({
  columns,
  initialStatus,
}: {
  columns: {
    status: string;
    label: string;
    regionLabel: string;
    content: ReactNode;
  }[];
  initialStatus: string;
}) {
  const desktop = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(desktopQuery).matches,
    () => false,
  );
  if (desktop)
    return (
      <div
        className="flex min-w-0 items-start gap-4 overflow-x-auto pb-4"
        aria-label="Finding status board"
        role="region"
      >
        {columns.map((column) => (
          <section
            key={column.status}
            aria-label={column.regionLabel}
            className="flex h-[min(70dvh,48rem)] min-h-80 w-72 shrink-0 flex-col overflow-hidden rounded-xl border bg-muted/40"
          >
            <header className="shrink-0 border-b bg-card p-3">
              <Heading level={2}>{column.label}</Heading>
            </header>
            <div
              role="group"
              aria-label={`${column.regionLabel} cards`}
              tabIndex={0}
              className="min-h-0 flex-1 overflow-y-auto p-3 outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50"
            >
              {column.content}
            </div>
          </section>
        ))}
      </div>
    );
  return (
    <Tabs.Root defaultValue={initialStatus} className="min-w-0 space-y-4">
      <Tabs.List
        aria-label="Finding status"
        className="flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted p-1"
      >
        {columns.map((column) => (
          <Tabs.Tab
            key={column.status}
            value={column.status}
            className="min-h-10 shrink-0 rounded-md px-3 text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-active:bg-card data-active:text-primary data-active:shadow-sm"
          >
            {column.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      {columns.map((column) => (
        <Tabs.Panel
          keepMounted
          key={column.status}
          value={column.status}
          className="space-y-4 rounded-xl border bg-muted/40 p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <section aria-label={column.regionLabel} className="space-y-4">
            <Heading level={2}>{column.label}</Heading>
            {column.content}
          </section>
        </Tabs.Panel>
      ))}
    </Tabs.Root>
  );
}

export function FilterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {children}
    </div>
  );
}
