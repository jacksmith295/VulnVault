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
          <Drawer.Backdrop className="fixed inset-0 z-40 bg-foreground/30" />
          <Drawer.Viewport className="fixed inset-0 z-40 flex justify-end">
            <Drawer.Popup
              className="flex h-dvh w-full max-w-sm flex-col overflow-y-auto border-l bg-background p-4 shadow-xl outline-none"
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
