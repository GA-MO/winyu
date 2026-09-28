import { cn } from "vexa/lib/utils";

const BLOB = "absolute rounded-full blur-3xl";

/** The soft pastel blobs behind every Winyu surface, faded into the page background. */
export function GlowBackdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className={cn(BLOB, "-left-40 -top-28 size-[34rem] animate-hero-drift bg-[var(--winyu-blob-violet)]")} />
      <div className={cn(BLOB, "-right-36 top-16 size-[36rem] animate-hero-drift-slow bg-[var(--winyu-blob-blue)]")} />
      <div className={cn(BLOB, "bottom-[-10rem] left-1/3 size-[28rem] animate-hero-drift bg-[var(--winyu-blob-pink)] [animation-delay:-6s]")} />
    </div>
  );
}
