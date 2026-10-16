import type { AlertRow, MetricId, Story } from "@/lib/contracts";

const SEVERITIES: readonly Anomaly["severity"][] = ["P1", "P2", "P3"];
const MEASURES: readonly (readonly MetricId[])[] = [
  ["net_sales_volume", "net_sales_value", "target_attainment"],
  ["stock_on_hand", "days_of_cover"],
];

/** An open anomaly as a story meets it: how severe, on which metric, where. */
export type Anomaly = Pick<AlertRow, "severity" | "metric" | "scope">;
type Subject = Story["subject"];

function measureOf(metric: MetricId): MetricId {
  return MEASURES.find((measure) => measure.includes(metric))?.[0] ?? metric;
}

/** A story explains an anomaly on the same measure (sell-in in litres, in baht or against target is one) in the anomaly's region, or in every region. */
export function explains(subject: Subject, anomaly: Anomaly): boolean {
  if (subject.metric === null) return false;
  return measureOf(subject.metric) === measureOf(anomaly.metric) && (subject.region === null || subject.region === anomaly.scope.region);
}

/** The P1 anomalies no story explains. */
export function unexplainedP1<A extends Anomaly>(subjects: readonly Subject[], anomalies: readonly A[]): A[] {
  return anomalies.filter((anomaly) => anomaly.severity === "P1" && !subjects.some((subject) => explains(subject, anomaly)));
}

function urgencyOf(subject: Subject, anomalies: readonly Anomaly[]): number[] {
  const explained = anomalies.filter((anomaly) => explains(subject, anomaly));
  return SEVERITIES.map((severity) => explained.filter((anomaly) => anomaly.severity === severity).length);
}

function moreUrgent(left: readonly number[], right: readonly number[]): number {
  const at = left.findIndex((count, index) => count !== right[index]);
  return at === -1 ? 0 : right[at] - left[at];
}

/** Stories most urgent first: the one explaining the most P1 anomalies, then P2, then P3; equally urgent ones keep the order Winyu wrote them in. */
export function byUrgency<S extends { subject: Subject }>(stories: readonly S[], anomalies: readonly Anomaly[]): S[] {
  return stories
    .map((story) => ({ story, urgency: urgencyOf(story.subject, anomalies) }))
    .sort((left, right) => moreUrgent(left.urgency, right.urgency))
    .map(({ story }) => story);
}
