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
import { Button } from "./button";
import { TextLink } from "./link";
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
  Feedback.configure({ feedback: "clone", dropAnimation: null }),
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

export function BoardDragCard({
  id,
  severity,
  status,
  disabled,
  title,
  children,
}: {
  id: string;
  severity: string;
  status: string;
  disabled: boolean;
  title: string;
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
      data-dragging={isDragging || undefined}
      className={cn(
        "relative rounded-xl border border-border border-l-4 bg-card text-card-foreground shadow-xs hover:shadow-md motion-safe:transition-shadow motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) data-dragging:shadow-xl",
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
      <div className="absolute right-2 top-2">
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
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

export function BoardCardTitle(props: ComponentProps<typeof TextLink>) {
  return <TextLink className="block pr-7 leading-relaxed" {...props} />;
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
