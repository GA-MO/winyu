import { createHash } from "node:crypto";
import type { Alert, Dim, MetricId, Region } from "@/lib/contracts";
import { responsibleFor } from "@/lib/access/raci";
import { toneOf } from "@/lib/dashboard/metric-display";
import { TODAY, addDays } from "@/lib/data/dates";
import { AGENTS } from "@/lib/data/entities/agents";
import { explain, regionOfDims } from "./hypothesis";
import { DAILY_SCAN, MONTHLY_SCAN, mean, scanFloor, scanSeries } from "./stats";
import { calendarSkipFor, inLentRegime, isoOfSlot, monthEnd, seriesFor } from "./series";
import { WATCHES, parentKeyOf, watchById, type Watch } from "./watches";

export const Z_OPEN = 4;
export const CRITICAL_GAP_PCT = 25;
export const WARN_GAP_PCT = 10;
const SHARE_CRITICAL_POINTS = 3;
const SHARE_WARN_POINTS = 1.5;
const POINT_METRICS: ReadonlySet<MetricId> = new Set<MetricId>(["market_share"]);
const COVER_CRITICAL = 7;
const PERCENT = 100;
const FLOOR_WINDOW = 7;
const BASELINE_TAIL = 56;
const VALUE_DECIMALS = 1;
const DISMISS_STEP = 3;
const DISMISS_FACTOR = 1.25;
const MAX_ALERTS = 60;
const MAX_PER_WATCH = 12;
const SEVERITY_RANK: Record<Alert["severity"], number> = { P1: 0, P2: 1, P3: 2 };
const RESOLVED_AFTER_DAYS = 3;
const DEMAND_METRIC: MetricId = "sell_out_volume";
const COVER_METRIC: MetricId = "days_of_cover";

export type Detection = {
  id: string;
  watchId: string;
  metric: MetricId;
  dims: Partial<Record<Dim, string>>;
  window: { from: string; to: string };
  observed: number;
  expected: number;
  zScore: number;
  direction: "up" | "down";
  severity: Alert["severity"];
  hypothesis: string;
  verifySteps: [string, string];
  ownerUserId: string;
  explained: boolean;
  ended: boolean;
  parentId: string | null;
  relatedIds: string[];
};

export type Thresholds = Record<string, number>;

function round(value: number): number {
  return Math.round(value * 10 ** VALUE_DECIMALS) / 10 ** VALUE_DECIMALS;
}

function detectionId(watch: Watch, dims: Partial<Record<Dim, string>>, subKey: string | null, direction: string): string {
  const key = [watch.id, watch.metric, subKey ?? "", ...watch.entityDims.map((dim) => `${dim}=${dims[dim]}`), direction].join("|");
  return `al_${createHash("sha1").update(key).digest("hex").slice(0, 16)}`;
}

/** The dismissal key an alert shares with every future alert about the same slice. */
export function thresholdKey(metric: MetricId, dims: Partial<Record<Dim, string>>): string {
  const parts = Object.entries(dims)
    .filter(([, value]) => Boolean(value))
    .map(([dim, value]) => `${dim}=${value}`)
    .sort();
  return [metric, ...parts].join("|");
}

export function thresholdFor(key: string, thresholds: Thresholds): number {
  const dismissals = thresholds[key] ?? 0;
  return Z_OPEN * DISMISS_FACTOR ** Math.floor(dismissals / DISMISS_STEP);
}

function gapPercent(observed: number, expected: number): number {
  if (expected === 0) return observed === 0 ? 0 : PERCENT;
  return ((observed - expected) / Math.abs(expected)) * PERCENT;
}

/** How much this movement hurts: a harmful gap of 25% (or cover at a week) is critical, 10% is worth a look, and good news is never a task. */
function severityInPoints(metric: MetricId, points: number): Alert["severity"] {
  if (toneOf(metric, points) !== "bad") return "P3";
  if (Math.abs(points) >= SHARE_CRITICAL_POINTS) return "P1";
  return Math.abs(points) >= SHARE_WARN_POINTS ? "P2" : "P3";
}

export function severityOf(watch: Pick<Watch, "metric" | "lowThreshold">, observed: number, expected: number): Alert["severity"] {
  if (watch.lowThreshold !== null) return observed <= COVER_CRITICAL ? "P1" : "P2";
  if (POINT_METRICS.has(watch.metric)) return severityInPoints(watch.metric, observed - expected);
  const gap = gapPercent(observed, expected);
  const size = Math.abs(gap);
  const harmful = toneOf(watch.metric, gap) === "bad";
  if (harmful && size >= CRITICAL_GAP_PCT) return "P1";
  if (harmful && size >= WARN_GAP_PCT) return "P2";
  return "P3";
}

function ownerOf(metric: MetricId, region: Region | null): string {
  return responsibleFor(metric, region)?.userId ?? "";
}

function moreSpecific(candidate: Detection, other: Detection): boolean {
  const candidateDims = Object.entries(candidate.dims).filter(([, value]) => Boolean(value));
  const otherDims = Object.entries(other.dims).filter(([, value]) => Boolean(value));
  if (otherDims.length >= candidateDims.length) return false;
  return otherDims.every(([dim, value]) => candidate.dims[dim as Dim] === value);
}

/** Drops a roll-up when a deeper slice already explains the same movement. */
export function dropRollUps(detections: Detection[]): Detection[] {
  return detections.filter((detection) => {
    return !detections.some(
      (other) => other !== detection && other.metric === detection.metric && other.direction === detection.direction && moreSpecific(other, detection),
    );
  });
}

function agentStoryKey(detection: Detection): string | null {
  if (!detection.dims.agent || detection.dims.sku) return null;
  return [detection.metric, detection.direction, detection.dims.agent].join("|");
}

function earlier(left: string, right: string): string {
  return left < right ? left : right;
}

function later(left: string, right: string): string {
  return left > right ? left : right;
}

function mergedStory(parts: Detection[]): Detection {
  const lead = parts.reduce((best, part) => (Math.abs(part.zScore) > Math.abs(best.zScore) ? part : best));
  const dims = { agent: lead.dims.agent, ...(lead.dims.region ? { region: lead.dims.region } : {}) };
  const window = {
    from: parts.reduce((min, part) => earlier(min, part.window.from), lead.window.from),
    to: parts.reduce((max, part) => later(max, part.window.to), lead.window.to),
  };
  const observed = parts.reduce((sum, part) => sum + part.observed, 0);
  const expected = parts.reduce((sum, part) => sum + part.expected, 0);
  const region = regionOfDims(dims);
  const explanation = explain({ metric: lead.metric, dims, direction: lead.direction, window, observed, expected, region, detail: null });
  const worst = parts.reduce((best, part) => (SEVERITY_RANK[part.severity] < SEVERITY_RANK[best.severity] ? part : best));
  return {
    ...lead,
    id: `al_${createHash("sha1").update(["story", lead.watchId, lead.metric, `agent=${lead.dims.agent}`, lead.direction].join("|")).digest("hex").slice(0, 16)}`,
    dims,
    window,
    observed: round(observed),
    expected: round(expected),
    severity: explanation.explained ? "P3" : worst.severity,
    hypothesis: explanation.hypothesis,
    verifySteps: explanation.verifySteps,
    explained: explanation.explained,
    ended: parts.every((part) => part.ended),
  };
}

/** Folds the brands of one agent moving the same way into a single alert, since they are one story for the person who acts on it. */
export function mergeAgentStories(detections: Detection[]): Detection[] {
  const groups = new Map<string, Detection[]>();
  for (const detection of detections) {
    const key = agentStoryKey(detection);
    if (key) groups.set(key, [...(groups.get(key) ?? []), detection]);
  }
  const merged = new Map<Detection, Detection | null>();
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const story = mergedStory(parts);
    parts.forEach((part, index) => merged.set(part, index === 0 ? story : null));
  }
  return detections.flatMap((detection) => {
    if (!merged.has(detection)) return [detection];
    const story = merged.get(detection);
    return story ? [story] : [];
  });
}

function isAgentStory(detection: Detection): boolean {
  return Boolean(detection.dims.agent) && !detection.dims.brand && !detection.dims.sku;
}

/** A single product of an agent whose whole book already moved the same way is part of that story, not a second alert. */
export function absorbIntoAgentStories(detections: Detection[]): Detection[] {
  const stories = new Set(detections.filter(isAgentStory).map((detection) => [detection.metric, detection.direction, detection.dims.agent].join("|")));
  return detections.filter((detection) => isAgentStory(detection) || !detection.dims.agent || !stories.has([detection.metric, detection.direction, detection.dims.agent].join("|")));
}

function skuStoryKey(detection: Detection): string | null {
  if (detection.dims.agent || !detection.dims.sku || !detection.dims.region) return null;
  return [detection.metric, detection.direction, detection.dims.sku, detection.dims.region].join("|");
}

function worstOf(parts: readonly Detection[]): Alert["severity"] {
  return parts.reduce((best, part) => (SEVERITY_RANK[part.severity] < SEVERITY_RANK[best.severity] ? part : best)).severity;
}

/** One product moving the same way in one region, across its channels and provinces, is one story: the strongest slice still moving leads at the worst severity, the rest become its children. */
export function groupSkuStories(detections: Detection[]): Detection[] {
  const groups = new Map<string, Detection[]>();
  for (const detection of detections) {
    const key = skuStoryKey(detection);
    if (key) groups.set(key, [...(groups.get(key) ?? []), detection]);
  }
  const placed = new Map<string, Pick<Detection, "severity" | "parentId">>();
  for (const parts of groups.values()) {
    if (parts.length < 2) continue;
    const live = parts.filter((part) => !part.ended);
    const lead = (live.length > 0 ? live : parts).reduce((best, part) => (Math.abs(part.zScore) > Math.abs(best.zScore) ? part : best));
    for (const part of parts) placed.set(part.id, part === lead ? { severity: worstOf(parts), parentId: null } : { severity: part.severity, parentId: lead.id });
  }
  return detections.map((detection) => ({ ...detection, ...placed.get(detection.id) }));
}

function provincesServedBy(dc: string): ReadonlySet<string> {
  return new Set(AGENTS.filter((agent) => agent.servingDc === dc).map((agent) => agent.provinceId));
}

function feedsDc(demand: Detection, cover: Detection, served: ReadonlySet<string>): boolean {
  if (demand.metric !== DEMAND_METRIC || demand.direction !== "up" || demand.dims.sku !== cover.dims.sku) return false;
  return demand.dims.province ? served.has(demand.dims.province) : demand.dims.region === cover.dims.region;
}

/** Stock running down at a DC and sell-out rising for the same product where that DC delivers are one chain of events: each side names the other, and each keeps its own owner. */
export function linkDemandToCover(detections: Detection[]): Detection[] {
  const links = new Map<string, Set<string>>();
  const link = (from: string, to: string) => links.set(from, new Set([...(links.get(from) ?? []), to]));
  for (const cover of detections) {
    if (cover.metric !== COVER_METRIC || cover.direction !== "down" || !cover.dims.dc || !cover.dims.sku) continue;
    const served = provincesServedBy(cover.dims.dc);
    for (const demand of detections.filter((candidate) => feedsDc(candidate, cover, served))) {
      const head = demand.parentId ?? demand.id;
      link(cover.id, head);
      link(head, cover.id);
    }
  }
  return detections.map((detection) => ({ ...detection, relatedIds: [...(links.get(detection.id) ?? [])] }));
}

function detectWatch(watch: Watch, thresholds: Thresholds, covered: Set<string>): Detection[] {
  const parent = watch.parent ? watchById(watch.parent) : null;
  const found: Detection[] = [];
  for (const series of seriesFor(watch)) {
    if (parent && covered.has(`${parent.id}:${parentKeyOf(watch, series.dims, parent)}`)) continue;
    const tailFrom = Math.max(0, series.values.length - BASELINE_TAIL);
    if (mean(series.values, tailFrom, series.values.length - 1) < watch.minLevel) continue;
    const scan = watch.lowThreshold === null
      ? scanSeries(inLentRegime(watch, series), series.season, watch.scan ?? (watch.grain === "month" ? MONTHLY_SCAN : DAILY_SCAN), calendarSkipFor(watch, series))
      : scanFloor(series.values, watch.lowThreshold, FLOOR_WINDOW);
    if (!scan) continue;
    if (watch.lowThreshold === null && Math.abs(scan.z) < thresholdFor(thresholdKey(watch.metric, series.dims), thresholds)) continue;

    const from = isoOfSlot(series, scan.from, watch.grain);
    const to = watch.grain === "month" ? monthEnd(isoOfSlot(series, scan.to, watch.grain)) : isoOfSlot(series, scan.to, watch.grain);
    const region = regionOfDims(series.dims);
    const dims = region ? { ...series.dims, region } : series.dims;
    const explanation = explain({
      metric: watch.metric,
      dims,
      direction: scan.direction,
      window: { from, to },
      observed: scan.observed,
      expected: scan.expected,
      region,
      detail: series.detail,
    });
    found.push({
      id: detectionId(watch, series.dims, series.subKey, scan.direction),
      watchId: watch.id,
      metric: watch.metric,
      dims,
      window: { from, to },
      observed: round(scan.observed),
      expected: round(scan.expected),
      zScore: round(scan.z),
      direction: scan.direction,
      severity: explanation.explained ? "P3" : severityOf(watch, scan.observed, scan.expected),
      hypothesis: explanation.hypothesis,
      verifySteps: explanation.verifySteps,
      ownerUserId: ownerOf(watch.metric, region),
      explained: explanation.explained,
      ended: watch.grain === "day" && watch.lowThreshold === null && to < addDays(TODAY, -RESOLVED_AFTER_DAYS),
      parentId: null,
      relatedIds: [],
    });
  }
  return found;
}

function capPerWatch(detections: Detection[]): Detection[] {
  const counts = new Map<string, number>();
  return detections
    .slice()
    .sort((left, right) => Math.abs(right.zScore) - Math.abs(left.zScore))
    .filter((detection) => {
      const seen = counts.get(detection.watchId) ?? 0;
      counts.set(detection.watchId, seen + 1);
      return seen < MAX_PER_WATCH;
    });
}

/** Every anomaly the watch list finds today, deepest slice first and roll-ups removed. */
export function detectAnomalies(thresholds: Thresholds = {}): Detection[] {
  const covered = new Set<string>();
  const found: Detection[] = [];
  for (const watch of WATCHES) {
    const detections = detectWatch(watch, thresholds, covered);
    for (const detection of detections) covered.add(`${watch.id}:${watch.entityDims.map((dim) => detection.dims[dim] ?? "").join("|")}`);
    found.push(...detections);
  }
  return linkDemandToCover(groupSkuStories(capPerWatch(absorbIntoAgentStories(mergeAgentStories(dropRollUps(found))))))
    .sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || Math.abs(right.zScore) - Math.abs(left.zScore))
    .slice(0, MAX_ALERTS);
}

function statusAfterRerun(previous: Alert | null, detection: Detection): Alert["status"] {
  const severity = detection.severity;
  if (detection.ended && previous?.status !== "dismissed") return "resolved";
  if (!previous) return "open";
  if (previous.status !== "dismissed") return previous.status;
  return SEVERITY_RANK[severity] < SEVERITY_RANK[previous.severity] ? "open" : "dismissed";
}

/** Folds a fresh detection into the stored alert; a dismissed alert stays dismissed, at the severity it was dismissed at, until it gets worse. */
export function toAlert(detection: Detection, previous: Alert | null): Alert {
  const status = statusAfterRerun(previous, detection);
  return {
    id: detection.id,
    at: previous?.at ?? `${TODAY}T06:00:00.000Z`,
    severity: status === "dismissed" && previous ? previous.severity : detection.severity,
    metric: detection.metric,
    dims: detection.dims,
    window: detection.window,
    observed: detection.observed,
    expected: detection.expected,
    zScore: detection.zScore,
    direction: detection.direction,
    hypothesis: detection.hypothesis,
    verifySteps: detection.verifySteps,
    ownerUserId: detection.ownerUserId,
    status,
    dismissCount: previous?.dismissCount ?? 0,
    parentId: detection.parentId,
    relatedIds: detection.relatedIds,
  };
}
