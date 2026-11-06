import NextLink from "next/link";
import type { ComponentProps } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const linkVariants = cva(
  "min-w-0 max-w-full rounded-lg font-medium outline-none motion-safe:transition-[color,background-color,border-color,box-shadow,opacity] motion-safe:duration-(--motion-duration-fast) motion-safe:ease-(--motion-ease-out) focus-visible:ring-3 focus-visible:ring-ring/50 [overflow-wrap:anywhere]",
  {
    variants: {
      variant: {
        default:
          "inline-flex h-(--control-height) items-center justify-center gap-2 bg-primary px-4 text-sm text-primary-foreground hover:bg-primary-hover",
        outline:
          "inline-flex h-(--control-height) items-center justify-center gap-2 border border-input bg-card px-4 text-sm hover:bg-muted",
        secondary:
          "inline-flex h-(--control-height) items-center justify-center gap-2 bg-secondary px-4 text-sm text-secondary-foreground hover:bg-accent",
        ghost:
          "inline-flex h-(--control-height) items-center justify-center gap-2 px-4 text-sm hover:bg-muted",
        text: "text-primary underline underline-offset-4 hover:text-primary-hover break-words",
      },
    },
    defaultVariants: { variant: "default" },
  },
);
export function Link({
  className,
  variant,
  reloadDocument,
  ...props
}: ComponentProps<typeof NextLink> &
  VariantProps<typeof linkVariants> & { reloadDocument?: boolean }) {
  if (reloadDocument) {
    const { href, ...anchorProps } = props;
    return (
      <a
        href={String(href)}
        className={cn(linkVariants({ variant }), className)}
        {...anchorProps}
      />
    );
  }
  return (
    <NextLink className={cn(linkVariants({ variant }), className)} {...props} />
  );
}
export const AppLink = Link;
export function TextLink(props: ComponentProps<typeof Link>) {
  return <Link variant="text" {...props} />;
}

export function TabNavLink({
  current,
  ...props
}: ComponentProps<typeof Link> & { current?: boolean }) {
  return (
    <Link
      variant={current ? "secondary" : "ghost"}
      aria-current={current ? "page" : undefined}
      {...props}
    />
  );
}
