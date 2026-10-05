"use client";

import { THEME_BOOT_SCRIPT } from "./theme-boot";

/** The theme boot as an inline script that runs during HTML parsing; a client render (a not-found page, an error boundary) gets an inert `text/plain` copy, so React neither runs nor warns about it. */
export function ThemeBootScript() {
  return <script type={typeof window === "undefined" ? "text/javascript" : "text/plain"} suppressHydrationWarning dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />;
}
