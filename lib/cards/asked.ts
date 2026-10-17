import type { MetricQuery, MetricRow } from "@/lib/contracts";
import { groupDimsOf, labelAlong } from "./rows";

const MIN_NAME_LENGTH = 3;
const SPACES = /\s+/g;
const MONTH_CLOSE = /จะปิด|ปิดเดือน|ปิดที่|จะถึงเป้า|ทันเป้า/;

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

/** What a text says about each row it names, every row included: the words from the row's first mention up to the next row's, read without spaces ("อุบลศรีสุข48.3%น่าจะติดเครดิต"), in the order the text names them. */
export function rowPassagesIn(text: string, query: MetricQuery, rows: readonly MetricRow[]): { label: string; words: string }[] {
  const dims = groupDimsOf(query);
  const labels = [...new Set(rows.flatMap((row) => labelAlong(dims, row) ?? []))];
  const prefix = sharedPrefixOf(labels);
  const flat = squeezed(text);
  const mentions = labels
    .map((label) => ({ label, at: Math.min(...namesOf(label, labels, prefix).map((name) => flat.indexOf(name)).filter((at) => at >= 0)) }))
    .filter((mention) => Number.isFinite(mention.at))
    .sort((left, right) => left.at - right.at);
  return mentions.map((mention, index) => ({ label: mention.label, words: flat.slice(mention.at, mentions[index + 1]?.at ?? flat.length) }));
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

/** Whether a question asks where the running month will close ("จะปิดที่กี่เปอร์เซ็นต์", "จะปิดเดือนได้ถึงเป้าไหม") rather than how far it has come. */
export function asksMonthEnd(question: string | null): boolean {
  return question !== null && MONTH_CLOSE.test(squeezed(question));
}
