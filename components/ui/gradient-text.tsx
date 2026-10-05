import { cn } from "./cn";

export function GradientText({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("winyu-gradient-text", className)}>{children}</span>;
}
