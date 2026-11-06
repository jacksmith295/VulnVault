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
        "inline-flex size-5 shrink-0 items-center justify-center rounded border border-input bg-card outline-none data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/40 data-disabled:opacity-60",
        typeof className === "string" && className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator>
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
    <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed">
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
