import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const textVariants = cva("min-w-0 leading-relaxed [overflow-wrap:anywhere]", {
  variants: {
    tone: {
      default: "text-foreground",
      muted: "text-muted-foreground",
      danger: "text-destructive",
      success: "text-success",
    },
    size: { sm: "text-sm", default: "text-base" },
  },
  defaultVariants: { tone: "default", size: "default" },
});
export function Text({
  className,
  tone,
  size,
  preserveWhitespace,
  measure = "default",
  ...props
}: ComponentProps<"p"> &
  VariantProps<typeof textVariants> & {
    preserveWhitespace?: boolean;
    measure?: "default" | "readable";
  }) {
  return (
    <p
      className={cn(
        textVariants({ tone, size }),
        measure === "readable" && "max-w-[70ch]",
        preserveWhitespace && "whitespace-pre-wrap",
        className,
      )}
      {...props}
    />
  );
}
export function Heading({
  level = 2,
  className,
  ...props
}: ComponentProps<"h2"> & { level?: 1 | 2 | 3 }) {
  const Tag = level === 1 ? "h1" : level === 2 ? "h2" : "h3";
  return (
    <Tag
      className={cn(
        "min-w-0 font-heading font-semibold tracking-tight [overflow-wrap:anywhere]",
        level === 1
          ? "text-3xl leading-tight"
          : level === 2
            ? "text-xl leading-snug"
            : "text-base leading-snug",
        className,
      )}
      {...props}
    />
  );
}
