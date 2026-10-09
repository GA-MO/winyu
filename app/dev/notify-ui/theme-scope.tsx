"use client";

import { useState, type ReactNode } from "react";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";

type Theme = "light" | "dark";

const THEME_CLASS: Record<Theme, string> = { light: "theme-light", dark: "dark" };
const OPTIONS: readonly { theme: Theme; label: string; icon: typeof Sun }[] = [
  { theme: "light", label: TH.notifyUi.light, icon: Sun },
  { theme: "dark", label: TH.notifyUi.dark, icon: Moon },
];

/** Light or dark for this page only, starting from `?theme=dark` when given; the rest of the app keeps its own theme. */
export function ThemeScope({ initial, header, children }: { initial: Theme; header: ReactNode; children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initial);
  return (
    <div className={cn(THEME_CLASS[theme], "min-h-dvh bg-background text-foreground")}>
      <header className="mx-auto flex max-w-[122rem] flex-wrap items-end gap-4 px-6 pb-6 pt-8">
        <div className="min-w-0 flex-1">{header}</div>
        <div role="radiogroup" aria-label={TH.notifyUi.theme} className="flex rounded-full bg-muted p-0.5 text-xs">
          {OPTIONS.map(({ theme: option, label, icon: Icon }) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={theme === option}
              onClick={() => setTheme(option)}
              className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 transition", theme === option ? "bg-card font-medium shadow-card" : "text-muted-foreground hover:text-foreground")}
            >
              <Icon className="size-3.5" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      </header>
      {children}
    </div>
  );
}
