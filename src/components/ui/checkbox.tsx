"use client";
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
export function Checkbox({
  className,
  ...props
}: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded border border-input bg-card motion-safe:transition-[color,background-color,border-color,box-shadow,opacity] motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) outline-hidden data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring data-disabled:opacity-60",
        typeof className === "string" && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="motion-safe:transition-opacity motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) motion-safe:data-starting-style:opacity-0 motion-safe:data-ending-style:opacity-0">
        <Check className="size-4" aria-hidden="true" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}
export function CheckboxField({
  label,
  description,
  ...props
}: CheckboxPrimitive.Root.Props & {
  label: ReactNode;
  description?: ReactNode;
}) {
  return (
    <label className="flex min-h-6 cursor-pointer items-start gap-3 text-sm leading-relaxed">
      <Checkbox {...props} />
      <span className="min-w-0 [overflow-wrap:anywhere]">
        <span className="font-medium">{label}</span>
        {description && (
          <span className="mt-1 block text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </label>
  );
}
