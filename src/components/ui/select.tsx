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
        className="flex h-(--control-height) w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-input bg-card px-3 text-sm motion-safe:transition-[color,background-color,border-color,box-shadow,opacity] motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) outline-hidden focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring data-placeholder:text-muted-foreground"
      >
        <SelectPrimitive.Value
          className="min-w-0 truncate"
          placeholder={placeholder}
        />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden="true" className="size-4" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={6}
          alignItemWithTrigger={false}
          className="z-50 outline-hidden"
        >
          <SelectPrimitive.Popup className="max-h-(--available-height) min-w-(--anchor-width) max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-hidden motion-safe:transition-[opacity,scale] motion-safe:duration-(--motion-duration-normal) motion-safe:ease-(--motion-ease-out) motion-safe:data-starting-style:opacity-0 motion-safe:data-starting-style:scale-98 motion-safe:data-ending-style:opacity-0 motion-safe:data-ending-style:scale-98">
            <SelectPrimitive.List>
              {options.map((option) => (
                <SelectPrimitive.Item
                  key={option.value}
                  value={option.value}
                  className="flex min-h-10 cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm outline-hidden select-none motion-safe:transition-[color,background-color,border-color,box-shadow,opacity] motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) data-highlighted:bg-accent data-highlighted:text-accent-foreground data-highlighted:outline-2 data-highlighted:outline-solid data-highlighted:-outline-offset-2 data-highlighted:outline-ring"
                >
                  <SelectPrimitive.ItemText className="min-w-0 flex-1 [overflow-wrap:anywhere]">
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
