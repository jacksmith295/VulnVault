"use client";
import type { ComponentProps } from "react";
import { Field } from "@base-ui/react/field";
import { cn } from "@/lib/utils";
export function Textarea({
  className,
  ref,
  id,
  name,
  value,
  defaultValue,
  disabled,
  ...props
}: ComponentProps<"textarea">) {
  return (
    <Field.Control
      id={id}
      name={name}
      value={value}
      defaultValue={defaultValue}
      disabled={disabled}
      render={<textarea ref={ref} {...props} />}
      className={cn(
        "min-h-32 w-full min-w-0 resize-y rounded-lg border border-input bg-card px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive md:text-sm",
        className,
      )}
    />
  );
}
