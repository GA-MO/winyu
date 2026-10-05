"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DARK_QUERY, THEME_STORAGE_KEY } from "./theme-boot";

export type ThemeMode = "light" | "dark";

type ThemeValue = { mode: ThemeMode; setMode: (mode: ThemeMode) => void; toggle: () => void };

const ThemeContext = createContext<ThemeValue>({ mode: "light", setMode: () => undefined, toggle: () => undefined });

function storedMode(): ThemeMode | null {
  try {
    const value = localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemMode(): ThemeMode {
  return typeof window !== "undefined" && window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function persist(mode: ThemeMode) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    return;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    const saved = storedMode();
    setMode(saved ?? systemMode());
    if (saved) return;
    const media = window.matchMedia(DARK_QUERY);
    const follow = () => {
      if (!storedMode()) setMode(systemMode());
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
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
