const LOCALE = "th-TH";
const CURRENCY = "THB";

export type Formatter = {
  currencySymbol: string;
  number: (value: number, maximumFractionDigits?: number) => string;
  integer: (value: number) => string;
  compact: (value: number, kind?: "number" | "currency" | "percent") => string;
};

function currencySymbol(): string {
  const parts = new Intl.NumberFormat(LOCALE, { style: "currency", currency: CURRENCY, currencyDisplay: "narrowSymbol" }).formatToParts(0);
  return parts.find((part) => part.type === "currency")?.value ?? CURRENCY;
}

function trimDecimal(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function createFormatter(): Formatter {
  const symbol = currencySymbol();
  const number = (value: number, maximumFractionDigits = 2) => new Intl.NumberFormat(LOCALE, { maximumFractionDigits }).format(value);
  const compact = (value: number, kind: "number" | "currency" | "percent" = "number") => {
    const abs = Math.abs(value);
    const sign = value < 0 ? "-" : "";
    const prefix = kind === "currency" ? symbol : "";
    const suffix = kind === "percent" ? "%" : "";
    if (abs >= 1_000_000) return `${sign}${prefix}${trimDecimal(abs / 1_000_000)}M${suffix}`;
    if (abs >= 1_000) return `${sign}${prefix}${trimDecimal(abs / 1_000)}K${suffix}`;
    return `${sign}${prefix}${trimDecimal(abs)}${suffix}`;
  };
  return { currencySymbol: symbol, number, integer: (value) => number(value, 0), compact };
}

/** Thai number formatting for chart axes and values. */
export const FORMATTER: Formatter = createFormatter();
