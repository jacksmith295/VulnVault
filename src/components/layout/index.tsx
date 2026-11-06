import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Heading, Text } from "@/components/ui/typography";
import { ThemeSelector } from "@/components/theme/ThemeSelector";
const widths = {
  default: "max-w-none",
  narrow: "max-w-xl",
  wide: "max-w-none",
};
export function Page({
  width = "default",
  layout = "default",
  className,
  ...props
}: ComponentProps<"main"> & {
  width?: keyof typeof widths;
  layout?: "default" | "board";
}) {
  return (
    <main
      className={cn(
        "mx-auto flex w-full min-w-0 flex-col gap-8 px-4 py-8 sm:px-6 sm:py-12",
        widths[width],
        layout === "board" && "flex-1 gap-6 py-6 sm:py-6",
        className,
      )}
      {...props}
    />
  );
}
export function PageHeader({
  title,
  description,
  actions,
  back,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: ReactNode;
}) {
  return (
    <header className="flex min-w-0 flex-col gap-4">
      {back}
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:flex-wrap">
        <div className="min-w-0 flex-1 space-y-2">
          <Heading level={1}>{title}</Heading>
          {description && <Text tone="muted">{description}</Text>}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-3">{actions}</div>
        )}
      </div>
    </header>
  );
}
export function Stack({
  gap = "default",
  grow = false,
  className,
  ...props
}: ComponentProps<"div"> & { gap?: "sm" | "default" | "lg"; grow?: boolean }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col",
        grow && "flex-1",
        gap === "sm" ? "gap-2" : gap === "lg" ? "gap-8" : "gap-4",
        className,
      )}
      {...props}
    />
  );
}
export function Inline({
  justify = "start",
  className,
  ...props
}: ComponentProps<"div"> & { justify?: "start" | "between" | "end" }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3",
        justify === "between" && "justify-between",
        justify === "end" && "justify-end",
        className,
      )}
      {...props}
    />
  );
}
export function Section({
  title,
  description,
  tone = "default",
  children,
  ...props
}: Omit<ComponentProps<"section">, "title"> & {
  title?: ReactNode;
  description?: ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <section
      className={cn(
        "min-w-0 space-y-4 rounded-xl border bg-card p-5 shadow-sm sm:p-6",
        tone === "danger" && "border-destructive/40",
      )}
      {...props}
    >
      {(title || description) && (
        <header className="space-y-2">
          {title && <Heading>{title}</Heading>}
          {description && (
            <Text tone="muted" size="sm">
              {description}
            </Text>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
export function FormLayout({
  width = "default",
  tone,
  className,
  ...props
}: ComponentProps<"form"> & {
  width?: "default" | "narrow";
  tone?: "surface";
}) {
  return (
    <form
      className={cn(
        "flex min-w-0 flex-col gap-5",
        width === "narrow" && "max-w-xl",
        tone === "surface" && "rounded-xl border bg-card p-5 sm:p-6",
        className,
      )}
      {...props}
    />
  );
}
export function FormActions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-3 pt-1", className)}
      {...props}
    />
  );
}
export function EmptyState({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-6 sm:p-8">
      <Heading>{title}</Heading>
      {description && <Text tone="muted">{description}</Text>}
      {actions && <div className="pt-2">{actions}</div>}
    </section>
  );
}
export function PublicShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
        <span className="font-heading text-lg font-semibold tracking-tight text-primary">
          VulnVault
        </span>
        <ThemeSelector />
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col px-4 pb-12 pt-4 sm:pt-10">
        {children}
      </main>
    </div>
  );
}
export function AuthSurface({ children }: { children: ReactNode }) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm sm:p-8">
      {children}
    </section>
  );
}
export function ItemList({ className, ...props }: ComponentProps<"ul">) {
  return (
    <ul className={cn("flex min-w-0 flex-col gap-4", className)} {...props} />
  );
}
export function ListItem({ className, ...props }: ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "min-w-0 rounded-xl border bg-card p-5 shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
export function DefinitionList({ className, ...props }: ComponentProps<"dl">) {
  return (
    <dl className={cn("grid gap-4 sm:grid-cols-2", className)} {...props} />
  );
}
export function DefinitionItem({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words text-sm font-medium">{children}</dd>
    </div>
  );
}
export function TabNav({ children }: { children: ReactNode }) {
  return (
    <nav
      aria-label="Service status"
      className="flex flex-wrap gap-2 border-b pb-4"
    >
      {children}
    </nav>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}
