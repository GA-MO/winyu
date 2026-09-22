import { cn } from "vexa/lib/utils";

const GRADIENT = "bg-gradient-to-r from-primary via-brand-violet to-primary bg-[length:200%_auto] bg-clip-text text-transparent animate-hero-shimmer";

export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn(GRADIENT, className)}>{children}</span>;
}
