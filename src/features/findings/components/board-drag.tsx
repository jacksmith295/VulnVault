"use client";

import {
  createContext,
  useContext,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import {
  DragDropProvider,
  useDraggable,
  useDroppable,
  useDragDropManager,
  type DragStartEvent,
  type DragOverEvent,
  type DragEndEvent,
} from "@dnd-kit/react";
import {
  Accessibility,
  Feedback,
  KeyboardSensor,
  PointerSensor,
  PointerActivationConstraints,
} from "@dnd-kit/dom";
import { GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TextLink } from "@/components/ui/link";
import { cn } from "@/lib/utils";

const DragContext = createContext({ dragging: false, disabled: true });

// A board move selects a status, so one arrow press selects the next visible
// destination rather than moving a card by an arbitrary number of pixels.
class BoardKeyboardSensor extends KeyboardSensor {
  cancel(event: Event) {
    this.handleEnd(event, true);
  }

  protected handleMove(
    direction: "up" | "down" | "left" | "right",
    event: KeyboardEvent,
  ) {
    const operation = this.manager.dragOperation;
    const targets = [...this.manager.registry.droppables].filter(
      (target) =>
        !target.disabled &&
        target.element &&
        target.element.getClientRects().length > 0,
    );
    if (!targets.length) return;
    const status =
      operation.target?.data.status ?? operation.source?.data.status;
    const index = targets.findIndex((target) => target.data.status === status);
    const step = direction === "right" || direction === "down" ? 1 : -1;
    const target =
      targets[Math.max(0, Math.min(targets.length - 1, index + step))];
    const rect = target.element!.getBoundingClientRect();
    event.preventDefault();
    this.manager.actions.move({
      event,
      to: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    });
  }
}

// Keep sensor and plugin descriptors stable. Replacing them during a render
// would reconfigure active drag sensors/plugins when feedback updates React state.
const boardSensors: NonNullable<
  ComponentProps<typeof DragDropProvider>["sensors"]
> = [
  PointerSensor.configure({
    activationConstraints: (event) =>
      event.pointerType === "touch"
        ? [
            new PointerActivationConstraints.Delay({
              value: 250,
              tolerance: 5,
            }),
          ]
        : [new PointerActivationConstraints.Distance({ value: 5 })],
  }),
  BoardKeyboardSensor,
];
const boardPluginOverrides = [
  Feedback.configure({ dropAnimation: null }),
  Accessibility.configure({
    screenReaderInstructions: {
      draggable:
        "Press Space or Enter to pick up a finding. Use arrow keys to move to a status, Space or Enter to drop, and Escape to cancel. You can also use the Change status menu.",
    },
    announcements: {
      dragstart: (event: DragStartEvent) =>
        `Picked up ${event.operation.source?.data.title}. Move to a status target.`,
      dragover: (event: DragOverEvent) =>
        event.operation.target
          ? `Over ${event.operation.target.data.label}.`
          : "Outside a status target.",
      dragend: (event: DragEndEvent) =>
        event.canceled
          ? "Move cancelled. Status unchanged."
          : event.operation.target
            ? "Dropped. Any status change will be confirmed after saving."
            : "Move cancelled. Status unchanged.",
    },
  }),
];
const boardPlugins: NonNullable<
  ComponentProps<typeof DragDropProvider>["plugins"]
> = (defaults) => [...defaults, ...boardPluginOverrides];
const cardFeedback = [
  Feedback.configure({ feedback: "move", dropAnimation: null }),
];

export function BoardDragProvider({
  children,
  disabled,
  onMove,
  onDraggingChange,
}: {
  children: ReactNode;
  disabled: boolean;
  onMove: (id: string, status: string) => void;
  onDraggingChange: (dragging: boolean) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const mounted = useRef(true);
  const focusFrame = useRef(0);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelAnimationFrame(focusFrame.current);
    };
  }, []);
  function restoreFocus(
    source: DragEndEvent["operation"]["source"],
    rendering: Promise<unknown>,
  ) {
    if (!mounted.current || !source) return;
    const handle = source.handle;
    const element = source.element;
    const board =
      element?.closest('[data-testid="finding-board"]') ??
      [
        ...(element?.ownerDocument.querySelectorAll(
          '[data-testid="finding-board"]',
        ) ?? []),
      ].find((candidate) => candidate.getClientRects().length > 0);
    cancelAnimationFrame(focusFrame.current);
    // Drag cleanup waits for the provider's React render. Restore focus after
    // that render and its top-layer cleanup, even when React yields a frame.
    void rendering.then(() => {
      if (!mounted.current) return;
      focusFrame.current = requestAnimationFrame(() => {
        if (!mounted.current) return;
        if (
          handle instanceof HTMLElement &&
          handle.isConnected &&
          handle.getClientRects().length > 0
        ) {
          handle.focus();
        } else {
          const tab = board?.querySelector<HTMLElement>(
            '[role="tab"][aria-selected="true"]',
          );
          if (tab?.getClientRects().length) tab.focus();
        }
      });
    });
  }
  function report(value: boolean) {
    setDragging(value);
    onDraggingChange(value);
  }
  return (
    <DragDropProvider
      sensors={boardSensors}
      plugins={boardPlugins}
      onBeforeDragStart={(event) => {
        if (disabled) event.preventDefault();
      }}
      onDragStart={() => report(true)}
      onDragEnd={(event, manager) => {
        report(false);
        const { source, target } = event.operation;
        if (
          !event.canceled &&
          !disabled &&
          source &&
          target &&
          source.data.status !== target.data.status
        ) {
          const id = String(source.id);
          const status = String(target.data.status);
          // The library calls this handler inside a React transition. Starting
          // a Server Action there would suspend drag cleanup and pending UI
          // until its network response. Leave that transition before saving.
          queueMicrotask(() => {
            if (mounted.current) onMove(id, status);
          });
        } else restoreFocus(source, manager.renderer.rendering);
      }}
    >
      <DragContext.Provider value={{ dragging, disabled }}>
        <DragLifecycle onCancel={() => report(false)} />
        {children}
      </DragContext.Provider>
    </DragDropProvider>
  );
}

function DragLifecycle({ onCancel }: { onCancel: () => void }) {
  const manager = useDragDropManager();
  const cancelFeedback = useEffectEvent(onCancel);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1280px)");
    function cancel(event: Event) {
      if (manager?.dragOperation.activatorEvent instanceof KeyboardEvent) {
        // End through the sensor so its document key listener is removed.
        // Stopping only the manager would let that listener end the next drag.
        manager.registry.sensors.get(BoardKeyboardSensor)?.cancel(event);
      } else {
        manager?.actions.stop({ canceled: true });
      }
      cancelFeedback();
    }
    media.addEventListener("change", cancel);
    // Cancel before the feedback plugin's resize listener can end a keyboard
    // drag as a successful drop using its previous destination.
    window.addEventListener("resize", cancel, { capture: true });
    return () => {
      media.removeEventListener("change", cancel);
      window.removeEventListener("resize", cancel, { capture: true });
      manager?.actions.stop({ canceled: true });
    };
  }, [manager]);
  return null;
}

export function useBoardDrag() {
  return useContext(DragContext);
}

export function BoardDragList({ children }: { children: ReactNode }) {
  const list = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<HTMLElement, DOMRect>());
  const origin = useRef<DOMRect | undefined>(undefined);
  const animations = useRef(new Map<HTMLElement, Animation>());
  function capture() {
    const element = list.current;
    if (!element || element.querySelector("[data-dnd-dragging]")) return;
    origin.current = element.getBoundingClientRect();
    positions.current = new Map(
      [...element.children]
        .filter((child): child is HTMLElement => child instanceof HTMLElement)
        .map((child) => {
          const rect = child.getBoundingClientRect();
          if (!animations.current.has(child)) return [child, rect];
          // A new pickup can begin during restoration. Keep layout coordinates
          // here because the observer adds the current visual offset once.
          const [x, y] = getComputedStyle(child).translate.split(/\s+/);
          return [
            child,
            new DOMRect(
              rect.x - (parseFloat(x) || 0),
              rect.y - (parseFloat(y) || 0),
              rect.width,
              rect.height,
            ),
          ];
        }),
    );
  }
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    let active = true;
    const ownedAnimations = animations.current;
    // The installed Feedback plugin marks the lifted original with this
    // attribute. Watching only that marker avoids restarting motion on moves.
    const observer = new MutationObserver(() => {
      if (!active) return;
      const previous = positions.current;
      const next = new Map<HTMLElement, DOMRect>();
      const currentOrigin = element.getBoundingClientRect();
      // Scrolling while holding a tile changes viewport coordinates without
      // changing where siblings sit within their column.
      const offsetX =
        currentOrigin.left - (origin.current?.left ?? currentOrigin.left);
      const offsetY =
        currentOrigin.top - (origin.current?.top ?? currentOrigin.top);
      const reduced = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      const styles = getComputedStyle(element);
      const duration = parseFloat(
        styles.getPropertyValue("--motion-duration-normal"),
      );
      const easing = styles.getPropertyValue("--motion-ease-out").trim();
      for (const child of element.children) {
        if (!(child instanceof HTMLElement)) continue;
        const visual = child.getBoundingClientRect();
        ownedAnimations.get(child)?.cancel();
        ownedAnimations.delete(child);
        if (child.hasAttribute("data-dnd-dragging")) continue;
        const current = child.getBoundingClientRect();
        next.set(child, current);
        const old = previous.get(child);
        if (!old || reduced) continue;
        const x =
          old.left + offsetX - current.left + visual.left - current.left;
        const y = old.top + offsetY - current.top + visual.top - current.top;
        if (!x && !y) continue;
        const animation = child.animate(
          { translate: [`${x}px ${y}px`, "0px 0px"] },
          { duration, easing },
        );
        ownedAnimations.set(child, animation);
        animation.onfinish = () => {
          if (ownedAnimations.get(child) === animation) {
            ownedAnimations.delete(child);
          }
        };
      }
      positions.current = next;
      origin.current = currentOrigin;
    });
    observer.observe(element, {
      subtree: true,
      attributes: true,
      attributeFilter: ["data-dnd-dragging"],
    });
    return () => {
      active = false;
      observer.disconnect();
      for (const animation of ownedAnimations.values()) animation.cancel();
      ownedAnimations.clear();
    };
  }, []);
  return (
    <div
      ref={list}
      className="flex min-w-0 flex-col gap-4"
      onPointerDownCapture={capture}
      onKeyDownCapture={capture}
    >
      {children}
    </div>
  );
}

export function BoardDragCard({
  id,
  severity,
  status,
  disabled,
  title,
  actions,
  children,
}: {
  id: string;
  severity: string;
  status: string;
  disabled: boolean;
  title: string;
  actions: ReactNode;
  children: ReactNode;
}) {
  const { ref, handleRef, isDragging } = useDraggable({
    id,
    type: "board-card",
    disabled,
    data: { title, status },
    plugins: cardFeedback,
  });
  return (
    <div
      ref={ref}
      data-slot="card"
      data-board-card-id={id}
      data-dragging={isDragging || undefined}
      className={cn(
        "relative rounded-xl border border-border border-l-4 bg-card text-sm text-card-foreground shadow-xs hover:shadow-md motion-safe:transition-shadow motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) data-dragging:shadow-xl",
        severity === "critical"
          ? "border-l-(--severity-critical)"
          : severity === "high"
            ? "border-l-(--severity-high)"
            : severity === "medium"
              ? "border-l-(--severity-medium)"
              : severity === "low"
                ? "border-l-(--severity-low)"
                : "border-l-(--severity-informational)",
      )}
    >
      <div className="absolute right-2 top-2 flex items-center gap-1">
        <Button
          ref={handleRef}
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          aria-label={`Move ${title}`}
          className="touch-none cursor-grab active:cursor-grabbing"
        >
          <GripVertical aria-hidden="true" />
        </Button>
        {actions}
      </div>
      <div className="p-2.5">{children}</div>
    </div>
  );
}

export function BoardCardTitle(props: ComponentProps<typeof TextLink>) {
  return <TextLink className="block pr-16 leading-snug" {...props} />;
}

export function BoardDropTarget({
  status,
  label,
  id,
  disabled,
  children,
  ...props
}: ComponentProps<"div"> & {
  status: string;
  label: string;
  id: string;
  disabled: boolean;
}) {
  const { ref, isDropTarget } = useDroppable({
    id,
    accept: "board-card",
    data: { status, label },
    disabled,
  });
  return (
    <div
      ref={ref}
      data-drop-status={status}
      data-drop-active={isDropTarget || undefined}
      className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl data-drop-active:outline-2 data-drop-active:outline-primary data-drop-active:-outline-offset-2 data-drop-active:bg-primary/10"
      {...props}
    >
      {children}
    </div>
  );
}
