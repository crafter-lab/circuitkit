"use client";

import { ThemeProvider, useTheme } from "next-themes";
import { type ReactNode, useSyncExternalStore } from "react";

const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function AppThemeProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      enableColorScheme
      disableTransitionOnChange
      storageKey="circuitkit-theme"
    >
      {children}
    </ThemeProvider>
  );
}

export function useSiteTheme() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { theme: mounted && resolvedTheme === "dark" ? "dark" : "light", mounted } as const;
}

export function ThemeToggle() {
  const { setTheme } = useTheme();
  const { theme, mounted } = useSiteTheme();
  return (
    <button
      className="theme-toggle"
      type="button"
      aria-label="Dark theme"
      aria-pressed={mounted && theme === "dark"}
      disabled={!mounted}
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      <span aria-hidden="true">{theme === "dark" ? "◑" : "◐"}</span>
      Dark theme
    </button>
  );
}
