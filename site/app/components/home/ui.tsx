import { Fragment, type ReactNode } from "react";
import { STATUS_LABEL, type Status } from "./content";

export type Tone = "tint" | "light" | "dark";

const TONE_CLASS: Record<Tone, string> = {
  tint: "bg-white/60 text-foreground",
  light: "bg-paper text-foreground",
  dark: "bg-night text-white",
};

const STATUS_CLASS: Record<Status, string> = {
  ready: "border-success/25 bg-success/8 text-success",
  adapter: "border-primary/25 bg-primary/8 text-primary",
  planned: "border-warning/30 bg-warning/10 text-warning",
};

export function Section({ id, tone, children, className = "" }: { id?: string; tone: Tone; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`relative scroll-mt-16 overflow-hidden px-4 py-24 sm:px-8 sm:py-32 ${TONE_CLASS[tone]} ${className}`}>
      <div className="relative mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}

/** Keeps each space-separated Thai phrase on one line, since Thai words have no spaces to break at safely. */
export function Phrases({ text }: { text: string }) {
  const phrases = text.split(" ");
  return (
    <>
      {phrases.map((phrase, index) => (
        <Fragment key={`${phrase}-${index}`}>
          <span className="inline-block">{phrase}</span>
          {index < phrases.length - 1 ? " " : null}
        </Fragment>
      ))}
    </>
  );
}

export function SectionHeader({ eyebrow, title, lead, dark = false }: { eyebrow: string; title: ReactNode; lead?: ReactNode; dark?: boolean }) {
  return (
    <header className="flex max-w-3xl flex-col gap-4">
      <p className={`font-mono text-[11px] font-medium uppercase tracking-[0.16em] ${dark ? "text-indigo-300" : "text-primary"}`}>{eyebrow}</p>
      <h2 className="font-display text-3xl font-medium leading-[1.12] tracking-[-0.035em] sm:text-[2.9rem]">{typeof title === "string" ? <Phrases text={title} /> : title}</h2>
      {lead ? <p className={`text-base leading-8 sm:text-lg ${dark ? "text-night-muted" : "text-muted-foreground"}`}>{lead}</p> : null}
    </header>
  );
}

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_CLASS[status]}`}>
      <span className="size-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

const BLOB_ALPHA = {
  strong: { primary: "bg-primary/14", violet: "bg-violet/12", coral: "bg-coral/12" },
  soft: { primary: "bg-primary/7", violet: "bg-violet/6", coral: "bg-coral/6" },
  night: { primary: "bg-primary/30", violet: "bg-violet/28", coral: "bg-coral/10" },
};

export function GlowBlobs({ intensity = "strong" }: { intensity?: keyof typeof BLOB_ALPHA }) {
  const alpha = BLOB_ALPHA[intensity];
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <div className={`absolute -left-40 -top-40 size-[38rem] animate-drift rounded-full blur-[120px] ${alpha.primary}`} />
      <div className={`absolute -right-40 top-10 size-[34rem] animate-drift-slow rounded-full blur-[120px] ${alpha.violet}`} />
      <div className={`absolute bottom-[-14rem] left-1/3 size-[30rem] animate-drift rounded-full blur-[120px] [animation-delay:-8s] ${alpha.coral}`} />
    </div>
  );
}

export function DotGrid() {
  return <div aria-hidden className="dot-grid pointer-events-none absolute inset-0" />;
}

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span className="grid size-8 place-items-center rounded-[10px] bg-[linear-gradient(135deg,var(--color-primary),var(--color-violet)_55%,var(--color-coral))] shadow-[0_8px_24px_-8px_rgb(124_58_237/70%)]">
        <span className="size-3.5 rounded-full border-[3px] border-white" />
      </span>
      <span className="font-display text-lg font-bold tracking-tight">Cop</span>
    </span>
  );
}
