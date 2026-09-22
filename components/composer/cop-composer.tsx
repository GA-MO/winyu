"use client";

import { useCallback, useEffect, useRef } from "react";
import { ArrowUp, Square } from "lucide-react";
import { cn } from "vexa/lib/utils";
import { TH } from "@/lib/i18n/th";

const SIZES = {
  hero: { frame: "rounded-[1.4rem] px-4 py-3.5", field: "min-h-14 text-base", button: "size-11" },
  docked: { frame: "rounded-2xl px-3 py-2.5", field: "min-h-10 text-sm", button: "size-9" },
} as const;

const FRAME = "cop-focus-glow flex items-end gap-2 border border-border/70 bg-card/80 backdrop-blur-xl transition";
const FIELD = "w-full flex-1 resize-none bg-transparent leading-relaxed text-foreground outline-none placeholder:text-muted-foreground";
const SEND = "inline-flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-violet text-primary-foreground shadow-lg shadow-primary/30 transition hover:shadow-xl hover:shadow-primary/40 disabled:opacity-40 disabled:shadow-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const MAX_HEIGHT_PX = 220;

export type CopComposerProps = {
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

export function CopComposer({
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
}: CopComposerProps) {
  const field = useRef<HTMLTextAreaElement>(null);
  const style = SIZES[size];

  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

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
      <div className={cn(FRAME, style.frame)}>
        <textarea
          ref={field}
          rows={1}
          value={value}
          autoFocus={autoFocus}
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
      {hint ? <div className="px-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
