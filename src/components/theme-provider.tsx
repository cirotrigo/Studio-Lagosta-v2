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
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [resolved, setResolved] = React.useState<"light" | "dark">(getSystemTheme());

  // Initialize from localStorage
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey) as Theme | null;
    if (saved) {
      setThemeState(saved);
    } else {
      setThemeState(defaultTheme);
    }
  }, [defaultTheme, storageKey]);

  // Listen for system changes
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setResolved(mql.matches ? "dark" : "light");
    onChange();
    mql.addEventListener?.("change", onChange);
    return () => mql.removeEventListener?.("change", onChange);
  }, []);

  // Apply theme to documentElement
  React.useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const applied = theme === "system" ? resolved : theme;
    root.classList.remove("light", "dark");
    root.classList.add(applied);
  }, [theme, resolved]);

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
