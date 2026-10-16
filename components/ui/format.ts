import { TH } from "@/lib/i18n/th";

const LOCALE = "th-TH";
const CURRENCY = "THB";
const MILLION = 1_000_000;
const THOUSAND = 1_000;

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
    const suffix = kind === "percent" ? "%" : "";
    if (abs >= MILLION) return `${sign}${number(abs / MILLION, 1)} ${TH.chart.million}${suffix}`;
    if (abs >= THOUSAND) return `${sign}${number(abs, 0)}${suffix}`;
    return `${sign}${trimDecimal(abs)}${suffix}`;
  };
  return { currencySymbol: symbol, number, integer: (value) => number(value, 0), compact };
}

/** Thai number formatting for chart axes and values. */
export const FORMATTER: Formatter = createFormatter();
