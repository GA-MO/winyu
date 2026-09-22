import { createHash } from "node:crypto";
import type { Alert, Dim, MetricId, Region } from "@/lib/contracts";
import { responsibleFor } from "@/lib/access/raci";
import { TODAY } from "@/lib/data/dates";
import { explain, regionOfDims } from "./hypothesis";
import { DAILY_SCAN, MONTHLY_SCAN, mean, scanFloor, scanSeries } from "./stats";
import { isoOfSlot, monthEnd, seriesFor } from "./series";
import { WATCHES, parentKeyOf, watchById, type Watch } from "./watches";

export const Z_OPEN = 4;
export const Z_WARN = 2;
export const Z_CRITICAL = 3;
const COVER_CRITICAL = 7;
const FLOOR_WINDOW = 7;
const BASELINE_TAIL = 56;
const VALUE_DECIMALS = 1;
const DISMISS_STEP = 3;
const DISMISS_FACTOR = 1.25;
const MAX_ALERTS = 60;
const MAX_PER_WATCH = 12;
const SEVERITY_RANK: Record<Alert["severity"], number> = { P1: 0, P2: 1, P3: 2 };

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

function severityOf(watch: Watch, z: number, observed: number): Alert["severity"] {
  if (watch.lowThreshold !== null && observed <= COVER_CRITICAL) return "P1";
  const magnitude = Math.abs(z);
  if (magnitude >= Z_CRITICAL) return "P1";
  if (magnitude >= Z_WARN) return "P2";
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

function detectWatch(watch: Watch, thresholds: Thresholds, covered: Set<string>): Detection[] {
  const parent = watch.parent ? watchById(watch.parent) : null;
  const found: Detection[] = [];
  for (const series of seriesFor(watch)) {
    if (parent && covered.has(`${parent.id}:${parentKeyOf(watch, series.dims, parent)}`)) continue;
    const tailFrom = Math.max(0, series.values.length - BASELINE_TAIL);
    if (mean(series.values, tailFrom, series.values.length - 1) < watch.minLevel) continue;
    const scan = watch.lowThreshold === null
      ? scanSeries(series.values, series.season, watch.grain === "month" ? MONTHLY_SCAN : DAILY_SCAN)
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
      severity: explanation.explained ? "P3" : severityOf(watch, scan.z, scan.observed),
      hypothesis: explanation.hypothesis,
      verifySteps: explanation.verifySteps,
      ownerUserId: ownerOf(watch.metric, region),
      explained: explanation.explained,
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
  return capPerWatch(dropRollUps(found))
    .sort((left, right) => SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] || Math.abs(right.zScore) - Math.abs(left.zScore))
    .slice(0, MAX_ALERTS);
}

export function toAlert(detection: Detection, previous: Alert | null): Alert {
  return {
    id: detection.id,
    at: previous?.at ?? `${TODAY}T06:00:00.000Z`,
    severity: detection.severity,
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
    status: previous?.status === "dismissed" ? "open" : (previous?.status ?? "open"),
    dismissCount: previous?.dismissCount ?? 0,
  };
}
