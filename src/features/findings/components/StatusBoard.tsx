"use client";

import { Tabs } from "@base-ui/react/tabs";
import {
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Heading } from "@/components/ui/typography";
import { cn } from "@/lib/utils";
import { BoardDropTarget, useBoardDrag } from "./board-drag";

function subscribeDesktop(callback: () => void) {
  const media = window.matchMedia("(min-width: 1280px)");
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function ColumnHeading({ label, total }: { label: string; total?: number }) {
  return (
    <div className="flex min-h-6 items-start justify-between gap-2">
      <Heading
        level={2}
        aria-label={total === undefined ? label : `${label} (${total})`}
        className="text-sm leading-6"
      >
        {label}
      </Heading>
      {total !== undefined && (
        <span
          aria-hidden="true"
          className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-muted px-1.5 text-xs font-semibold tabular-nums text-muted-foreground"
        >
          {total}
        </span>
      )}
    </div>
  );
}

export function StatusBoard({
  columns,
  selectedStatus,
  onStatusChange,
}: {
  columns: {
    status: string;
    label: string;
    total?: number;
    regionLabel: string;
    content: ReactNode;
  }[];
  selectedStatus: string;
  onStatusChange?: (status: string) => void;
}) {
  const { dragging, disabled } = useBoardDrag();
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1280px)").matches,
    () => false,
  );
  return (
    <Tabs.Root
      value={selectedStatus}
      onValueChange={(value) => onStatusChange?.(String(value))}
      className="flex min-w-0 flex-1 flex-col"
      render={
        <div
          role="region"
          aria-label="Finding status board"
          data-testid="finding-board"
        />
      }
    >
      {dragging && (
        <div
          role="group"
          aria-label="Drop finding into status"
          className="fixed inset-x-2 bottom-3 z-50 grid grid-cols-3 gap-1 rounded-xl border bg-card p-2 shadow-xl xl:hidden"
        >
          {columns.map((column) => (
            <BoardDropTarget
              key={column.status}
              id={`mobile-${column.status}`}
              status={column.status}
              label={column.label}
              disabled={desktop || disabled}
              data-drop-mobile="true"
            >
              <div className="flex min-h-10 items-center justify-center rounded-lg border border-input px-1 text-center text-xs font-medium">
                {column.label}
              </div>
            </BoardDropTarget>
          ))}
        </div>
      )}
      <Tabs.List
        aria-label="Finding status"
        className="mb-4 flex max-w-full gap-1 overflow-x-auto rounded-lg border bg-muted p-1 xl:hidden"
      >
        {columns.map((column) => (
          <Tabs.Tab
            key={column.status}
            value={column.status}
            disabled={!onStatusChange}
            className="min-h-10 shrink-0 rounded-md px-3 text-sm font-medium outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:-outline-offset-2 focus-visible:outline-ring data-active:bg-card data-active:text-primary data-active:shadow-sm"
          >
            {column.label}
            {column.total === undefined ? "" : ` (${column.total})`}
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
              selectedStatus === column.status ? "flex" : "hidden xl:flex",
            )}
          >
            <BoardDropTarget
              id={`column-${column.status}`}
              status={column.status}
              label={column.label}
              disabled={!desktop || disabled}
              data-drop-desktop="true"
            >
              <section
                aria-label={column.regionLabel}
                className="flex min-h-0 min-w-0 flex-1 flex-col"
              >
                <header className="shrink-0 border-b bg-card p-3">
                  <ColumnHeading label={column.label} total={column.total} />
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
            </BoardDropTarget>
          </Tabs.Panel>
        ))}
      </div>
    </Tabs.Root>
  );
}
