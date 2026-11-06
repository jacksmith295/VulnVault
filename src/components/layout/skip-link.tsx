export function SkipLink() {
  return (
    <a
      href="#main-content"
      className="sr-only fixed left-4 top-4 z-[60] rounded-lg border border-input bg-card px-4 py-3 font-medium text-foreground focus:not-sr-only focus:fixed focus:outline-2 focus:outline-solid focus:outline-offset-2 focus:outline-ring"
    >
      Skip to main content
    </a>
  );
}
