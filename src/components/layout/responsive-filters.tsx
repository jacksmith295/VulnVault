"use client";

import { Drawer } from "@base-ui/react/drawer";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { DesktopFilters, MobileFilters } from "./board";

export function ResponsiveFilters({
  appliedCount,
  pending,
  children,
}: {
  appliedCount: number;
  pending: boolean;
  children: (
    presentation: "desktop" | "mobile",
    close: () => void,
  ) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const desktopRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <>
      <DesktopFilters>
        <div ref={desktopRef}>{children("desktop", () => {})}</div>
      </DesktopFilters>
      <Drawer.Root open={open} onOpenChange={setOpen} swipeDirection="right">
        <MobileFilters>
          <Drawer.Trigger render={<Button variant="outline" />}>
            <SlidersHorizontal aria-hidden="true" />
            Filters ({appliedCount}){pending ? " · Applying…" : ""}
          </Drawer.Trigger>
        </MobileFilters>
        <Drawer.Portal>
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-foreground/30 opacity-[calc(1-var(--drawer-swipe-progress,0))] motion-safe:transition-opacity motion-safe:duration-(--motion-duration-panel) motion-safe:ease-(--motion-ease-out) motion-safe:data-starting-style:opacity-0 motion-safe:data-ending-style:opacity-0 data-swiping:duration-0" />
          <Drawer.Viewport className="fixed inset-0 z-40 flex justify-end">
            <Drawer.Popup
              className="flex h-dvh w-full max-w-sm flex-col overflow-y-auto border-l bg-background p-4 shadow-xl outline-none [transform:translateX(var(--drawer-swipe-movement-x,0px))] motion-safe:transition-transform motion-safe:duration-[calc(var(--motion-duration-panel)*var(--drawer-swipe-strength,1))] motion-safe:ease-(--motion-ease-out) motion-safe:data-starting-style:[transform:translateX(100%)] motion-safe:data-ending-style:[transform:translateX(100%)] data-swiping:duration-0"
              finalFocus={() => {
                // A resized desktop must not return focus to the hidden mobile trigger.
                if (window.matchMedia("(min-width: 1024px)").matches)
                  return (
                    desktopRef.current?.querySelector<HTMLElement>(
                      "button, input, select",
                    ) ?? false
                  );
                return true;
              }}
            >
              <div className="mb-4 flex items-center justify-between gap-3">
                <Drawer.Title className="text-lg font-semibold">
                  Finding filters
                </Drawer.Title>
                <Drawer.Close render={<Button variant="ghost" />}>
                  Close
                </Drawer.Close>
              </div>
              {children("mobile", () => setOpen(false))}
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
