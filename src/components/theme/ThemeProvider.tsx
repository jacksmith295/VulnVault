"use client";
import type { ReactNode } from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      storageKey="vv-theme"
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
