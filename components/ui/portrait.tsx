import { cn } from "./cn";
import { initialOf } from "./primitives";

/** A person's photo, or the first letter of their name when there is none. */
export function Portrait({ name, src, className }: { name: string; src: string | null; className?: string }) {
  if (src) return <img src={src} alt={name} className={cn("shrink-0 rounded-full object-cover", className)} />;
  return <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-bubble font-semibold text-accent-foreground", className)}>{initialOf(name)}</span>;
}
