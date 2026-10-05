"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { TH } from "@/lib/i18n/th";

const FRAME = "winyu-focus-ring flex items-end gap-2 rounded-[1.75rem] border border-transparent bg-card bg-clip-padding px-4 py-3.5 shadow-card transition";
const FIELD = "min-h-14 w-full flex-1 resize-none bg-transparent text-base leading-relaxed text-foreground outline-none placeholder:text-muted-foreground";
const SEND = "inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-ink text-ink-foreground transition hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MAX_HEIGHT_PX = 220;

/** The landing's question box: Enter sends, Shift+Enter breaks the line, ⌘K focuses it from anywhere on the page. */
export function LandingComposer({ placeholder, busy, onSubmit }: { placeholder: string; busy: boolean; onSubmit: (prompt: string) => void }) {
  const field = useRef<HTMLTextAreaElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    field.current?.focus({ preventScroll: true });
    function focusOnShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      field.current?.focus();
    }
    window.addEventListener("keydown", focusOnShortcut);
    return () => window.removeEventListener("keydown", focusOnShortcut);
  }, []);

  const send = () => {
    const prompt = value.trim();
    if (!prompt || busy) return;
    onSubmit(prompt);
  };

  return (
    <div data-busy={busy || undefined} className={FRAME}>
      <textarea
        ref={field}
        rows={1}
        value={value}
        aria-label={placeholder}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
          event.preventDefault();
          send();
        }}
        className={FIELD}
      />
      <button type="button" onClick={send} disabled={!value.trim() || busy} aria-label={TH.landing.send} className={SEND}>
        <ArrowUp className="size-5" aria-hidden />
      </button>
    </div>
  );
}
