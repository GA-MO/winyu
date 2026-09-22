import { cn } from "vexa/lib/utils";

const FADE = "bg-[radial-gradient(ellipse_at_top,transparent_35%,var(--background)_92%)]";

/** The drifting indigo→violet blobs of the Vexa website, faded into the page background. */
export function GlowBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="absolute -left-40 -top-24 size-[32rem] animate-hero-drift rounded-full bg-primary/25 blur-3xl" />
      <div className="absolute -right-32 top-24 size-[34rem] animate-hero-drift-slow rounded-full bg-brand-violet/25 blur-3xl" />
      <div className="absolute bottom-[-8rem] left-1/3 size-[26rem] animate-hero-drift rounded-full bg-info/15 blur-3xl [animation-delay:-6s]" />
      <div className={cn("absolute inset-0", FADE)} />
    </div>
  );
}
