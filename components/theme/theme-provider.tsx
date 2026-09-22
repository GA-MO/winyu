"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "cop-theme";
export const THEME_BOOT_SCRIPT = `try{var m=localStorage.getItem("${THEME_STORAGE_KEY}");if(m==="light")document.documentElement.classList.remove("dark");}catch(e){}`;

type ThemeValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void; toggle: () => void };

const ThemeContext = createContext<ThemeValue>({ mode: "dark", setMode: () => undefined, toggle: () => undefined });

function storedMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function persist(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    const saved = storedMode();
    if (saved) setMode(saved);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);

  const choose = useCallback((next: ThemeMode) => {
    setMode(next);
    persist(next);
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({ mode, setMode: choose, toggle: () => choose(mode === "dark" ? "light" : "dark") }),
    [choose, mode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
