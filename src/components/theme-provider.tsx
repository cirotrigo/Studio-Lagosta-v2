"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

const ThemeContext = React.createContext<
  | {
      theme: Theme;
      setTheme: (theme: Theme) => void;
      resolvedTheme: "light" | "dark";
    }
  | undefined
>(undefined);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "system",
  storageKey = "app.theme",
}: ThemeProviderProps) {
  // Use hydration-safe initialization
  const [mounted, setMounted] = React.useState(false);

  // Initialize theme state with a function to avoid calling getSystemTheme during SSR
  const [theme, setThemeState] = React.useState<Theme>(() => {
    // During SSR, always return defaultTheme
    if (typeof window === "undefined") return defaultTheme;

    // During client-side rendering, try to get from localStorage
    try {
      const saved = window.localStorage.getItem(storageKey) as Theme | null;
      return saved || defaultTheme;
    } catch {
      return defaultTheme;
    }
  });

  const [resolved, setResolved] = React.useState<"light" | "dark">(() => {
    // During SSR, use a consistent default
    if (typeof window === "undefined") return "light";
    return getSystemTheme();
  });

  // Mark component as mounted after hydration
  React.useEffect(() => {
    setMounted(true);

    // Update theme from localStorage after hydration if needed
    if (typeof window !== "undefined") {
      const saved = window.localStorage.getItem(storageKey) as Theme | null;
      if (saved && saved !== theme) {
        setThemeState(saved);
      }
    }
  }, [storageKey, theme]);

  // Listen for system theme changes
  React.useEffect(() => {
    if (!mounted || typeof window === "undefined") return;

    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mql.matches ? "dark" : "light");
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, [mounted]);

  // Apply theme to documentElement
  React.useEffect(() => {
    if (!mounted || typeof document === "undefined") return;

    const root = document.documentElement;
    const applied = theme === "system" ? resolved : theme;
    root.classList.remove("light", "dark");
    root.classList.add(applied);
  }, [mounted, theme, resolved]);

  const setTheme = React.useCallback(
    (t: Theme) => {
      setThemeState(t);
      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, t);
      }
    },
    [storageKey]
  );

  const value = React.useMemo(
    () => ({ theme, setTheme, resolvedTheme: theme === "system" ? resolved : (theme as "light" | "dark") }),
    [theme, setTheme, resolved]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
