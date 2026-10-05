import type { ActionEvent, Alert, Investigation, ContextPacket, DashboardLayout, FeedStateRecord, FeedTone, Forecast, MemoryFact, Notification, OutboxEntry, PersonalWatch } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";

export type StoredForecast = Forecast;
export type StoredLayout = DashboardLayout;
export type { OutboxEntry };

export const COLLECTIONS = {
  alerts: "alerts",
  forecasts: "forecasts",
  memory: "memory",
  memoryReviews: "memory-reviews",
  packets: "packets",
  notifications: "notifications",
  outbox: "outbox",
  layouts: "layouts",
} as const;

export function alerts() {
  return collection<Alert>(COLLECTIONS.alerts);
}

export function forecasts() {
  return collection<StoredForecast>(COLLECTIONS.forecasts);
}

export function memoryFacts() {
  return collection<MemoryFact>(COLLECTIONS.memory);
}

export type MemoryReview = { id: string; at: string; before: number; after: number };

export function memoryReviews() {
  return collection<MemoryReview>(COLLECTIONS.memoryReviews);
}

export function packets() {
  return collection<ContextPacket>(COLLECTIONS.packets);
}

export function notifications() {
  return collection<Notification>(COLLECTIONS.notifications);
}

export function outbox() {
  return collection<OutboxEntry>(COLLECTIONS.outbox);
}

export function layouts() {
  return collection<StoredLayout>(COLLECTIONS.layouts);
}

export type AlertThreshold = { id: string; dismissals: number; updatedAt: string };

export function alertThresholds() {
  return collection<AlertThreshold>("alert-thresholds");
}

export type AlertMute = { id: string; userId: string; key: string; until: string };

export function alertMutes() {
  return collection<AlertMute>("alert-mutes");
}

export type Visit = { id: string; at: string; alertIds: string[]; previousAt: string | null; previousAlertIds: string[] | null; shownKeys?: string[]; seenCounts?: Record<string, number> };

export function visits() {
  return collection<Visit>("visits");
}

export function personalWatches() {
  return collection<PersonalWatch>("watches");
}

export type JobRun = { id: string; lastRunAt: string; lastRunDay: string };

export function jobRuns() {
  return collection<JobRun>("job-runs");
}

/** The last digest sent to a user: what it covered, so tomorrow tells only what is new or turned red; digests sent before the feed recorded only `alertIds`. */
export type DigestSent = { id: string; day: string; keys?: string[]; tones?: Record<string, FeedTone>; alertIds?: string[] };

export function digests() {
  return collection<DigestSent>("digests");
}

export type AlertOutcome = { id: string; key: string; alertId: string; verdict: "real" | "noise"; outcome: string; byUserId: string; at: string };

export function alertOutcomes() {
  return collection<AlertOutcome>("alert-outcomes");
}

export type PacketOrigin = { id: string; threadId: string; userId: string };

export function packetOrigins() {
  return collection<PacketOrigin>("packet-origins");
}

export function actionEvents() {
  return collection<ActionEvent>("events");
}

export type LayoutVersion = { id: string; userId: string; version: number; widgets: DashboardLayout["widgets"]; savedAt: string };

export function layoutVersions() {
  return collection<LayoutVersion>("layout-versions");
}

export type StaffRequest = { id: string; userId: string; kind: "leave" | "course"; refId: string; from: string; to: string; days: number; reason: string; packetId: string; at: string };

export function staffRequests() {
  return collection<StaffRequest>("staff-requests");
}

export function feedStates() {
  return collection<FeedStateRecord>("feed-states");
}

export function investigations() {
  return collection<Investigation>("investigations");
}
