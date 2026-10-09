import { cn } from "@/components/ui/cn";
import { FOCUS } from "@/components/admin/parts";
import type { RoleId } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { markedParts, type ScopeDraft } from "@/lib/connectors/spec";

const COPY = TH.connectorUi;

/** A person the admin can test or sample as: who, which role, and the scope that role sees. */
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

export function Check({ checked, onChange, children, className, disabled = false }: { checked: boolean; onChange: (next: boolean) => void; children: React.ReactNode; className?: string; disabled?: boolean }) {
  return (
    <label className={cn("flex items-start gap-2 text-[13px]", disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer", className)}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--color-ink)]" />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

/** A remote description shown as data: framed, invisible characters made visible, instruction blocks struck through. */
export function FencedText({ text, caption = COPY.tools.remote }: { text: string; caption?: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-dashed border-border bg-muted/40">
      <figcaption className="flex items-center justify-between gap-2 border-b border-dashed border-border px-3 py-1.5 text-[11px] text-muted-foreground">
        <span>{caption}</span>
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

export function ProblemLine({ text, detail }: { text: string; detail?: string }) {
  return (
    <p role="alert" className="rounded-2xl bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
      {text}
      {detail ? <span className="mt-0.5 block font-mono text-[11px] opacity-80">{detail}</span> : null}
    </p>
  );
}
