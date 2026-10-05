import type { ModelSpend } from "@/lib/server/model-ledger";
import { TH } from "@/lib/i18n/th";
import { Stat } from "./parts";

const COPY = TH.admin.usage;
const USD_DIGITS = 2;
const SMALL_USD = 0.01;

function usd(value: number): string {
  if (value > 0 && value < SMALL_USD) return `<$${SMALL_USD.toFixed(USD_DIGITS)}`;
  return `$${value.toFixed(USD_DIGITS)}`;
}

function billingLine(spend: ModelSpend): string {
  if (spend.billedCalls === spend.calls) return COPY.spendBilled;
  return COPY.spendPartly(spend.calls - spend.billedCalls);
}

/** What the models cost this fortnight, as OpenRouter billed each call, split by chat, eval and background jobs. */
export function SpendStat({ spend }: { spend: ModelSpend }) {
  if (spend.calls === 0) return <Stat label={COPY.spendLabel} value="$0.00" sub={COPY.spendNone} />;
  const sources = COPY.spendSources(usd(spend.bySource.chat), usd(spend.bySource.eval), usd(spend.bySource.background));
  return <Stat label={COPY.spendLabel} value={usd(spend.totalUsd)} sub={`${billingLine(spend)} · ${sources}`} />;
}
