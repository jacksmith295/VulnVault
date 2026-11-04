"use client";
import { Menu as MenuPrimitive } from "@base-ui/react/menu";
import NextLink from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { ChevronDown, Check } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export const Menu = MenuPrimitive.Root;
export function MenuTrigger({
  children,
  className,
  ...props
}: MenuPrimitive.Trigger.Props) {
  return (
    <MenuPrimitive.Trigger
      className={cn(
        buttonVariants({ variant: "outline" }),
        "max-w-full min-w-0",
        typeof className === "string" && className,
      )}
      {...props}
    >
      <span className="min-w-0 truncate">{children}</span>
      <ChevronDown aria-hidden="true" className="size-4 shrink-0" />
    </MenuPrimitive.Trigger>
  );
}
export function MenuPopup({
  align = "start",
  children,
  ...props
}: ComponentProps<typeof MenuPrimitive.Popup> & { align?: "start" | "end" }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        align={align}
        sideOffset={8}
        className="z-50 outline-none"
      >
        <MenuPrimitive.Popup
          className="max-h-(--available-height) w-72 max-w-[calc(100vw-2rem)] origin-(--transform-origin) overflow-y-auto rounded-xl border bg-popover p-1.5 text-popover-foreground shadow-lg outline-none"
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}
const itemClass =
  "flex min-h-10 cursor-default items-center gap-3 rounded-md px-3 py-2 text-sm leading-snug outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:opacity-50";
export function MenuItem({ className, ...props }: MenuPrimitive.Item.Props) {
  return (
    <MenuPrimitive.Item
      className={cn(itemClass, typeof className === "string" && className)}
      {...props}
    />
  );
}
export function MenuLink({
  href,
  current,
  children,
  ...props
}: Omit<ComponentProps<typeof NextLink>, "className"> & {
  current?: boolean;
  children: ReactNode;
}) {
  return (
    <MenuItem
      render={<NextLink href={href} {...props} />}
      aria-current={current ? "page" : undefined}
    >
      <span className="min-w-0 flex-1 break-words">{children}</span>
      {current && (
        <>
          <Check aria-hidden="true" className="size-4 shrink-0" />
          <span className="sr-only"> (current)</span>
        </>
      )}
    </MenuItem>
  );
}
export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1.5 border-t" />;
}
export const MenuRadioGroup = MenuPrimitive.RadioGroup;
export function MenuRadioItem({
  children,
  className,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      closeOnClick
      className={cn(itemClass, typeof className === "string" && className)}
      {...props}
    >
      <span className="flex-1">{children}</span>
      <MenuPrimitive.RadioItemIndicator>
        <Check className="size-4" aria-hidden="true" />
      </MenuPrimitive.RadioItemIndicator>
    </MenuPrimitive.RadioItem>
  );
}
