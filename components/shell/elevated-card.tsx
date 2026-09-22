const CARD_SHADOW = "0 12px 32px -18px var(--vexa-glow-soft)";

export function ElevatedCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-5 transition-transform hover:-translate-y-0.5" style={{ boxShadow: CARD_SHADOW }}>
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}
