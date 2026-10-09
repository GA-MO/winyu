import { cn } from "@/components/ui/cn";
import { FOCUS } from "@/components/admin/parts";
import { INVISIBLE_CHARS } from "@/lib/harness/fence";
import type { RoleId } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import type { ScopeDraft } from "./model";

const COPY = TH.connectorUi;

const ROLE_MARKUP = /<\/?\s*(system|assistant|user|tool|instructions?|prompt)\b[^>]*>|\[\s*(system|assistant|instructions?|admin)\s*\]/gi;
const INSTRUCTION_MARKUP = /<\s*(system|assistant|instructions?|prompt)\b[^>]*>[\s\S]*?<\/\s*\1\s*>/gi;

export type Person = { id: string; nameTh: string; role: RoleId; scopeTh: string };

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[13px] font-medium">{children}</span>
      {hint ? <span className="text-[12px] leading-relaxed text-muted-foreground">{hint}</span> : null}
    </span>
  );
}

/** A row of mutually exclusive choices, drawn as joined pills. */
export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: readonly { id: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap self-start rounded-full border border-border bg-muted/50 p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          onClick={() => onChange(option.id)}
          className={cn("h-8 rounded-full px-3 text-[13px] transition", FOCUS, value === option.id ? "bg-card font-medium text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function Check({ checked, onChange, children, className }: { checked: boolean; onChange: (next: boolean) => void; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-2 text-[13px]", className)}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function hasSuspiciousText(text: string): boolean {
  return new RegExp(INVISIBLE_CHARS.source).test(text) || new RegExp(ROLE_MARKUP.source, "i").test(text);
}

/** The text Winyu offers as the model-facing description: whole instruction blocks and invisible characters cut, role markup removed. */
export function cleanedDescription(text: string): string {
  return text.replace(INSTRUCTION_MARKUP, "").replace(INVISIBLE_CHARS, "").replace(ROLE_MARKUP, "").replace(/\s{2,}/g, " ").trim();
}

function markedParts(text: string): { text: string; flagged: boolean }[] {
  const parts: { text: string; flagged: boolean }[] = [];
  const pattern = new RegExp(`${INSTRUCTION_MARKUP.source}|${INVISIBLE_CHARS.source}`, "gi");
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const at = match.index ?? 0;
    if (at > last) parts.push({ text: text.slice(last, at), flagged: false });
    const shown = match[0].replace(INVISIBLE_CHARS, (char) => `⟨U+${char.charCodeAt(0).toString(16).toUpperCase().padStart(4, "0")}⟩`);
    parts.push({ text: shown, flagged: true });
    last = at + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), flagged: false });
  return parts;
}

/** A remote description shown as data: framed, invisible characters made visible, instruction blocks struck through. */
export function FencedText({ text }: { text: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40">
      <figcaption className="flex items-center justify-between gap-2 border-b border-dashed border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{COPY.tools.remote}</span>
        <span className="font-mono">⟦{COPY.tools.remoteNote}⟧</span>
      </figcaption>
      <p className="whitespace-pre-wrap break-words px-3 py-2.5 font-mono text-[12px] leading-relaxed text-foreground/80">
        {markedParts(text).map((part, index) =>
          part.flagged ? (
            <mark key={index} className="rounded bg-danger/10 px-0.5 text-danger line-through decoration-danger/60">
              {part.text}
            </mark>
          ) : (
            <span key={index}>{part.text}</span>
          ),
        )}
      </p>
    </figure>
  );
}

export function scopeCell(scope: ScopeDraft): string {
  if (scope.kind === "scoped") return COPY.review.cell[scope.filter.kind];
  return COPY.review.cell[scope.kind];
}
