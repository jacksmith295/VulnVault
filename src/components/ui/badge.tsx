import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
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
        "inline-flex shrink-0 items-center rounded-md px-2 py-1 text-xs font-medium",
        tone === "danger"
          ? "bg-destructive/10 text-destructive"
          : tone === "muted"
            ? "bg-muted text-muted-foreground"
            : "bg-accent text-accent-foreground",
        className,
      )}
      {...props}
    />
  );
}
