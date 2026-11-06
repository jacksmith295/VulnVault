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
        "min-h-32 w-full min-w-0 resize-y rounded-lg border border-input bg-card px-3 py-2 text-base motion-safe:transition-[color,background-color,border-color,box-shadow,opacity] motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) outline-hidden placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-destructive md:text-sm",
        className,
      )}
    />
  );
}
