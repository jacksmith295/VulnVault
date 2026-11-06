"use client";

import { Tabs } from "@base-ui/react/tabs";
import { useState, type ComponentProps, type ReactNode } from "react";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";

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
  const [selected, setSelected] = useState(initialStatus);
  return (
    <Tabs.Root
      value={selected}
      onValueChange={(value) => setSelected(String(value))}
      className="flex min-w-0 flex-1 flex-col"
      render={
        <div
          role="region"
          aria-label="Finding status board"
          data-testid="finding-board"
        />
      }
    >
      <Tabs.List
        aria-label="Finding status"
        className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted p-1 xl:hidden"
      >
        {columns.map((column) => (
          <Tabs.Tab
            key={column.status}
            value={column.status}
            className="min-h-10 shrink-0 rounded-md px-3 text-sm font-medium outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring data-active:bg-card data-active:text-primary data-active:shadow-sm"
          >
            {column.label}
          </Tabs.Tab>
        ))}
      </Tabs.List>
      <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-6">
        {columns.map((column) => (
          <Tabs.Panel
            keepMounted
            hidden={false}
            inert={false}
            tabIndex={-1}
            key={column.status}
            value={column.status}
            aria-label={column.regionLabel}
            className={cn(
              "min-h-80 min-w-0 flex-col overflow-hidden rounded-xl border bg-muted/40 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring",
              selected === column.status ? "flex" : "hidden xl:flex",
            )}
          >
            <section
              aria-label={column.regionLabel}
              className="flex min-h-0 min-w-0 flex-1 flex-col"
            >
              <header className="shrink-0 border-b bg-card p-3">
                <Heading level={2}>{column.label}</Heading>
              </header>
              <div
                role="group"
                aria-label={`${column.regionLabel} cards`}
                tabIndex={0}
                className="min-h-0 min-w-0 flex-1 basis-0 overflow-y-auto p-3 outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring [overflow-wrap:anywhere] [&_button]:max-w-full [&_button]:min-w-0"
              >
                {column.content}
              </div>
            </section>
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  );
}

export function BoardSpace({ children }: { children: ReactNode }) {
  return <div className="min-h-80 flex-1">{children}</div>;
}

export function FilterGrid({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-3 lg:items-end lg:gap-3 xl:grid-cols-[repeat(5,minmax(0,1fr))_auto]">
      {children}
    </div>
  );
}

export function BoardFilterForm(props: ComponentProps<"form">) {
  return <form className="min-w-0 rounded-xl border bg-card p-4" {...props} />;
}

export function BoardFilterActions({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-(--control-height) flex-wrap items-center gap-3 lg:col-span-3 xl:col-span-1">
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
