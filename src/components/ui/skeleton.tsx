import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({
  size = "line",
  className,
  ...props
}: ComponentProps<"div"> & { size?: "line" | "control" | "label" }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "rounded-md bg-muted motion-safe:animate-pulse",
        size === "line" && "h-4 w-3/4",
        size === "control" && "h-(--control-height) w-full border border-input",
        size === "label" && "h-5 w-24",
        className,
      )}
      {...props}
    />
  );
}
