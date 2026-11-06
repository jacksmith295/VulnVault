import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export type SeverityTone =
  "critical" | "high" | "medium" | "low" | "informational";

const severityStyles: Record<SeverityTone, string> = {
  critical:
    "border-severity-critical/20 bg-severity-critical-subtle text-severity-critical",
  high: "border-severity-high/20 bg-severity-high-subtle text-severity-high",
  medium:
    "border-severity-medium/20 bg-severity-medium-subtle text-severity-medium",
  low: "border-severity-low/20 bg-severity-low-subtle text-severity-low",
  informational:
    "border-severity-informational/20 bg-severity-informational-subtle text-severity-informational",
};

export function SeverityBadge({
  severity,
  className,
  ...props
}: ComponentProps<"span"> & { severity: SeverityTone }) {
  return (
    <span
      data-severity={severity}
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-semibold leading-snug [overflow-wrap:anywhere]",
        severityStyles[severity],
        className,
      )}
      {...props}
    />
  );
}
export function Badge({
  tone = "default",
  className,
  ...props
}: ComponentProps<"span"> & {
  tone?: "default" | "success" | "muted" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center rounded-md px-2 py-1 text-xs font-medium leading-snug [overflow-wrap:anywhere]",
        tone === "danger"
          ? "bg-destructive/10 text-destructive"
          : tone === "muted"
            ? "bg-muted text-muted-foreground"
            : tone === "success"
              ? "bg-success/10 text-success"
              : "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
