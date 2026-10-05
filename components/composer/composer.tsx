"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";

const SIZES = {
  hero: { frame: "rounded-[1.75rem] px-4 py-3.5", field: "min-h-14 text-base", button: "size-11" },
  docked: { frame: "rounded-[1.5rem] px-3 py-2.5", field: "min-h-10 text-sm", button: "size-9" },
} as const;

const FRAME = "winyu-focus-ring flex items-end gap-2 border border-transparent bg-card bg-clip-padding shadow-card transition";
const FIELD = "w-full flex-1 resize-none bg-transparent leading-relaxed text-foreground outline-none placeholder:text-muted-foreground";
const SEND = "inline-flex shrink-0 items-center justify-center rounded-full bg-ink text-ink-foreground transition hover:opacity-90 disabled:bg-muted disabled:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MAX_HEIGHT_PX = 220;

export type ComposerProps = {
  value: string;
  onValueChange: (value: string) => void;
  onSubmit: (value: string) => void;
  size?: keyof typeof SIZES;
  placeholder?: string;
  busy?: boolean;
  onStop?: () => void;
  autoFocus?: boolean;
  hint?: React.ReactNode;
  className?: string;
};

/** The one text box for asking: Enter sends, Shift+Enter breaks a line, ⌘K focuses it, and while a reply streams the button stops it. */
export function Composer({
  value,
  onValueChange,
  onSubmit,
  size = "hero",
  placeholder = TH.landing.composerPlaceholder,
  busy = false,
  onStop,
  autoFocus = false,
  hint,
  className,
}: ComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const style = SIZES[size];

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    if (!autoFocus) return;
    field.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  useEffect(() => {
    function focusOnShortcut(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      field.current?.focus();
    }
    window.addEventListener("keydown", focusOnShortcut);
    return () => window.removeEventListener("keydown", focusOnShortcut);
  }, []);

  const send = useCallback(() => {
    const next = value.trim();
    if (!next || busy) return;
    onSubmit(next);
  }, [busy, onSubmit, value]);

  return (
    <div className={cn("flex w-full flex-col gap-2", className)}>
      <div data-busy={busy || undefined} className={cn(FRAME, style.frame)}>
        <textarea
          ref={field}
          rows={1}
          value={value}
          aria-label={placeholder}
          placeholder={placeholder}
          onChange={(event) => onValueChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            send();
          }}
          className={cn(FIELD, style.field)}
        />
        {busy && onStop ? (
          <button type="button" onClick={onStop} aria-label={TH.chat.stop} className={cn(SEND, style.button)}>
            <Square className="size-4" aria-hidden />
          </button>
        ) : (
          <button type="button" onClick={send} disabled={!value.trim() || busy} aria-label={TH.chat.send} className={cn(SEND, style.button)}>
            <ArrowUp className="size-5" aria-hidden />
          </button>
        )}
      </div>
      {hint ? <div className="px-2 text-center text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
