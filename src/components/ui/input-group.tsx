import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
export function InputGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("relative", className)} {...props} />;
}
export function InputGroupAction({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn("absolute inset-y-0 right-1 flex items-center", className)}
      {...props}
    />
  );
}
