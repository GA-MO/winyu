import { cn } from "vexa/lib/utils";

export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("cop-gradient-text", className)}>{children}</span>;
}
