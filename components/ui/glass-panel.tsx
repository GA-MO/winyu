import { cn } from "vexa/lib/utils";

const GLASS = "rounded-2xl border border-border/70 bg-card/70 backdrop-blur-xl";

export function GlassPanel({ children, className, ...rest }: React.ComponentProps<"div">) {
  return (
    <div className={cn(GLASS, className)} {...rest}>
      {children}
    </div>
  );
}
