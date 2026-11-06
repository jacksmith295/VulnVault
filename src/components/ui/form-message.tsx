import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function FormMessage({
  tone = "error",
  className,
  ...props
}: ComponentProps<"p"> & { tone?: "error" | "success" | "info" }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-lg border p-3 text-sm leading-relaxed outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:animate-feedback",
        tone === "error"
          ? "border-destructive/30 bg-destructive/5 text-destructive"
          : tone === "success"
            ? "border-success/30 bg-success/5 text-success"
            : "border-border bg-muted text-foreground",
        className,
      )}
      {...props}
    />
  );
}
