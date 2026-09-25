import { existsSync } from "node:fs";
import path from "node:path";
import type { AccessContext, Alert, ContextPacket, Dim, Forecast, Region } from "@/lib/contracts";
import { alertMutes, alertThresholds, alerts, forecasts, packets } from "@/lib/server/agent/collections";
import { DATA_DIR } from "@/lib/server/store/json-store";
import { detectAnomalies, thresholdKey, toAlert, type Thresholds } from "@/lib/engine/anomaly";
import { buildForecasts } from "@/lib/engine/forecast";
import { templateFor } from "@/lib/dashboard/templates";
import { findUser } from "@/lib/data/entities/users";
import { alertRowOf } from "@/lib/cards/alert-row";
import { rememberAction } from "@/lib/engine/memory";
import { TH } from "@/lib/i18n/th";
import { loadDictionary } from "@/lib/server/master-data";
import { recordAction } from "@/lib/server/threads";

const MUTE_DAYS = 14;
const DAY_MS = 86_400_000;
const RAISE_EVERY = 3;
const SEVERITY_RANK: Record<Alert["severity"], number> = { P1: 0, P2: 1, P3: 2 };

export type AlertRelevance = "mine" | "watched" | "other";

const RELEVANCE_RANK: Record<AlertRelevance, number> = { mine: 0, watched: 1, other: 2 };

let running = false;

function storedThresholds(): Thresholds {
  return Object.fromEntries(alertThresholds().all().map((entry) => [entry.id, entry.dismissals]));
}

/** Re-runs detection and folds the result into the stored alerts, keeping what the user already did with them. */
export function runAnomalyJob(): { alerts: number } {
  const store = alerts();
  const previous = new Map(store.all().map((alert) => [alert.id, alert]));
  const detections = detectAnomalies(storedThresholds());
  const kept = new Set<string>();
  for (const detection of detections) {
    store.put(toAlert(detection, previous.get(detection.id) ?? null));
    kept.add(detection.id);
  }
  for (const alert of previous.values()) {
    if (!kept.has(alert.id) && alert.status === "open") store.remove(alert.id);
  }
  return { alerts: kept.size };
}

export function runForecastJob(): { forecasts: number } {
  const store = forecasts();
  for (const stale of store.all()) store.remove(stale.id);
  const built = buildForecasts();
  for (const forecast of built) store.put(forecast);
  return { forecasts: built.length };
}

export function runEngineJobs(): { alerts: number; forecasts: number } {
  return { ...runAnomalyJob(), ...runForecastJob() };
}

/** Fills the analytics plane the first time the app runs against an empty `.data`. */
export function ensureEngine(): void {
  if (running) return;
  if (existsSync(path.join(DATA_DIR, "alerts.json"))) return;
  running = true;
  try {
    runEngineJobs();
  } finally {
    running = false;
  }
}

function inScope(alert: Alert, access: AccessContext): boolean {
  if (alert.ownerUserId === access.userId) return true;
  if (access.metricAcl[alert.metric] !== "full") return false;
  if (access.regions === "all") return true;
  const region = alert.dims.region;
  return !region || access.regions.includes(region as Region);
}

/** Whether an alert is this user's to act on: they own it, it is on a metric their role watches, or it is only in their scope. */
export function relevanceOf(alert: Alert, access: AccessContext, watched: ReadonlySet<string> = watchedMetrics(access)): AlertRelevance {
  if (alert.ownerUserId === access.userId) return "mine";
  return watched.has(alert.metric) ? "watched" : "other";
}

function watchedMetrics(access: AccessContext): ReadonlySet<string> {
  return new Set(templateFor(access).map((seed) => seed.query.metric));
}

function awayFromHome(alert: Alert, home: string | null): number {
  return home !== null && alert.dims.region !== home ? 1 : 0;
}

function rankFor(access: AccessContext): (left: Alert, right: Alert) => number {
  const watched = watchedMetrics(access);
  const home = findUser(access.userId)?.region ?? null;
  return (left, right) =>
    RELEVANCE_RANK[relevanceOf(left, access, watched)] - RELEVANCE_RANK[relevanceOf(right, access, watched)] ||
    awayFromHome(left, home) - awayFromHome(right, home) ||
    SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
    Math.abs(right.zScore) - Math.abs(left.zScore);
}

function mutedKeys(userId: string, now = Date.now()): ReadonlySet<string> {
  const at = new Date(now).toISOString();
  return new Set(alertMutes().where((mute) => mute.userId === userId && mute.until > at).map((mute) => mute.key));
}

/** The open alerts this user can see, minus the slices they said are not theirs, most relevant first. */
export function openAlertsFor(access: AccessContext): Alert[] {
  ensureEngine();
  const muted = mutedKeys(access.userId);
  return alerts()
    .where((alert) => alert.status === "open" && inScope(alert, access) && !muted.has(thresholdKey(alert.metric, alert.dims)))
    .sort(rankFor(access));
}

export function allAlertsFor(access: AccessContext): Alert[] {
  ensureEngine();
  return alerts().where((alert) => inScope(alert, access)).sort(rankFor(access));
}

export function openPacketsFor(access: AccessContext): ContextPacket[] {
  return packets()
    .where((packet) => packet.toUserId === access.userId && packet.status !== "resolved")
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export function forecastsFor(access: AccessContext): Forecast[] {
  ensureEngine();
  return forecasts().where((forecast) => {
    if (access.metricAcl[forecast.metric] === "none") return false;
    if (access.regions === "all") return true;
    const region = forecast.dims.region;
    return !region || access.regions.includes(region as Region);
  });
}

function managesUser(managerId: string, userId: string): boolean {
  let current = findUser(userId)?.managerId ?? null;
  while (current) {
    if (current === managerId) return true;
    current = findUser(current)?.managerId ?? null;
  }
  return false;
}

/** Only the owner of an alert, or someone above them, can say it is not an anomaly for everyone. */
export function canJudge(alert: Alert, access: AccessContext): boolean {
  return alert.ownerUserId === access.userId || managesUser(access.userId, alert.ownerUserId);
}

/** The alert, if this user is allowed to see it at all. */
export function visibleAlert(id: string, access: AccessContext): Alert | null {
  const alert = alerts().get(id);
  return alert && inScope(alert, access) ? alert : null;
}

/** "Not mine": hides this slice from this user only, for two weeks. */
export function muteAlert(alert: Alert, access: AccessContext, now = Date.now()): { until: string } {
  const key = thresholdKey(alert.metric, alert.dims);
  const until = new Date(now + MUTE_DAYS * DAY_MS).toISOString();
  alertMutes().put({ id: `${access.userId}|${key}`, userId: access.userId, key, until });
  return { until };
}

/** "Not an anomaly": closes it for everyone; every third time on the same slice raises the bar the next run has to clear. */
export function dismissAlert(alert: Alert): { alert: Alert; raised: boolean } {
  const updated = alerts().put({ ...alert, status: "dismissed", dismissCount: alert.dismissCount + 1 });
  const key = thresholdKey(alert.metric, alert.dims);
  const store = alertThresholds();
  const dismissals = (store.get(key)?.dismissals ?? 0) + 1;
  store.put({ id: key, dismissals, updatedAt: new Date().toISOString() });
  return { alert: updated, raised: dismissals % RAISE_EVERY === 0 };
}

export function alertById(id: string): Alert | null {
  return alerts().get(id);
}

/** The intent an alert's events are counted under: the slice it watches, not the one alert, so a reopened alert is the same interest. */
export function alertIntentKey(alert: Alert): string {
  return `alert:${thresholdKey(alert.metric, alert.dims)}`;
}

export function alertSubject(alert: Alert): { metric: Alert["metric"]; dims: Dim[] } {
  return { metric: alert.metric, dims: Object.keys(alert.dims) as Dim[] };
}

/** "Not mine": hides the slice for this user for a while, remembers they do not follow it, and counts it as a dismissal. */
export async function muteAlertForUser(alert: Alert, access: AccessContext, now = Date.now()): Promise<{ until: string }> {
  const muted = muteAlert(alert, access, now);
  const row = alertRowOf(alert, await loadDictionary());
  rememberAction(access.userId, { type: "preference", value: TH.memory.notFollowing(`${row.metricLabel} ${row.scopeLabel}`) });
  recordAction(access.userId, "dismiss", alertIntentKey(alert), null, null, alertSubject(alert));
  return muted;
}
