"use client";

import { Select as SelectPrimitive } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";

export function Select<Value extends string>({
  id,
  name,
  value,
  onValueChange,
  options,
  placeholder,
  required = false,
}: {
  id: string;
  name: string;
  value: Value | null;
  onValueChange: (value: Value | null) => void;
  options: readonly { value: Value; label: string }[];
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <SelectPrimitive.Root
      id={id}
      name={name}
      value={value}
      onValueChange={onValueChange}
      items={options}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        className="flex h-(--control-height) w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-input bg-card px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-placeholder:text-muted-foreground"
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-50 outline-none"
        >
          <SelectPrimitive.Popup className="max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none">
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="flex min-h-10 cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <SelectPrimitive.ItemText className="flex-1">
                    {option.label}
                  </SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator>
                    <Check aria-hidden="true" className="size-4" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
