import type { MetricQuery, MetricRow } from "@/lib/contracts";
import { groupDimsOf, labelAlong } from "./rows";

const MIN_NAME_LENGTH = 3;
const SPACES = /\s+/g;

function squeezed(text: string): string {
  return text.replace(SPACES, "");
}

function sharedPrefixOf(labels: readonly string[]): string {
  if (labels.length < 2) return "";
  let prefix = labels[0];
  for (const label of labels.slice(1)) {
    while (prefix && !label.startsWith(prefix)) prefix = prefix.slice(0, -1);
  }
  return prefix;
}

function firstWordOf(label: string): string {
  return label.split(" ")[0] ?? "";
}

/** The ways a question may name a row: its whole label, the label without the prefix every row shares ("เบียร์" of "กลุ่มเบียร์"), and its first word when no other row starts with it ("อุบลศรีสุข" of "อุบลศรีสุข เทรดดิ้ง"). */
function namesOf(label: string, labels: readonly string[], prefix: string): string[] {
  const first = firstWordOf(label);
  const uniqueFirst = labels.filter((other) => firstWordOf(other) === first).length === 1;
  const names = [label, label.slice(prefix.length), uniqueFirst ? first : ""];
  return names.map(squeezed).filter((name) => name.length >= MIN_NAME_LENGTH);
}

/** The labels (along the group dims) of the rows a question names, so a card can draw the row asked about with its value and change; empty when none is named, or when every row is, which singles nothing out. */
export function rowsNamedIn(question: string | null, query: MetricQuery, rows: readonly MetricRow[]): string[] {
  const dims = groupDimsOf(query);
  if (!question || dims.length === 0) return [];
  const labels = [...new Set(rows.flatMap((row) => labelAlong(dims, row) ?? []))];
  const prefix = sharedPrefixOf(labels);
  const text = squeezed(question);
  const named = labels.filter((label) => namesOf(label, labels, prefix).some((name) => text.includes(name)));
  return named.length === labels.length && labels.length > 1 ? [] : named;
}
