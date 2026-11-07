"use client";
import type { ReactNode } from "react";
import { Field } from "@base-ui/react/field";
export function FormField({
  id,
  label,
  description,
  error,
  name,
  children,
}: {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
  error?: string;
  name?: string;
  children: ReactNode;
}) {
  return (
    <Field.Root
      name={name}
      invalid={Boolean(error)}
      className="flex min-w-0 flex-col gap-2"
    >
      <Field.Label htmlFor={id} className="text-sm font-medium leading-snug">
        {label}
      </Field.Label>
      {children}
      {description && (
        <Field.Description
          id={id ? `${id}-description` : undefined}
          className="text-sm leading-relaxed text-muted-foreground"
        >
          {description}
        </Field.Description>
      )}
      {error && (
        <Field.Error
          id={id ? `${id}-error` : undefined}
          match
          className="text-sm leading-relaxed text-destructive"
        >
          {error}
        </Field.Error>
      )}
    </Field.Root>
  );
}
