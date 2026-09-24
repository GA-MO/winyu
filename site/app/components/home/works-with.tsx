const SYSTEMS = [
  "SAP S/4HANA",
  "SAP BW",
  "Snowflake",
  "Databricks",
  "BigQuery",
  "SQL Server",
  "Power BI",
  "SuccessFactors",
  "Salesforce",
  "Microsoft Entra ID",
  "Microsoft 365",
  "MuleSoft",
];

/** A slow marquee of the kinds of systems Cop is designed to read from; names only, no logos or claims of partnership. */
export function WorksWith() {
  return (
    <section aria-label="ระบบที่ Cop ออกแบบมาให้อ่านได้" className="bg-paper px-4 pb-6 sm:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6">
        <p className="font-mono text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">Designed to read from the systems you already run</p>
        <div className="relative w-full overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
          <div className="flex w-max animate-marquee motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-x-10 motion-reduce:gap-y-4">
            {[...SYSTEMS, ...SYSTEMS].map((name, index) => (
              <span key={`${name}-${index}`} aria-hidden={index >= SYSTEMS.length} className={`whitespace-nowrap pr-14 font-display text-2xl motion-reduce:pr-0 font-semibold tracking-[-0.02em] text-foreground/35 ${index >= SYSTEMS.length ? "motion-reduce:hidden" : ""}`}>
                {name}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
