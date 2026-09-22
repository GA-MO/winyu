import type { ActionEvent, Alert, ContextPacket, DashboardLayout, Forecast, MemoryFact, Notification, OutboxEntry } from "@/lib/contracts";
import { collection } from "@/lib/server/store/json-store";

export type StoredForecast = Forecast;
export type StoredLayout = DashboardLayout;
export type { OutboxEntry };

export const COLLECTIONS = {
  alerts: "alerts",
  forecasts: "forecasts",
  memory: "memory",
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

export function layoutOf(userId: string): DashboardLayout {
  const stored = layouts().get(userId);
  if (stored) return stored;
  return { id: userId, userId, version: 0, widgets: [], updatedAt: new Date().toISOString() };
}

export type AlertThreshold = { id: string; dismissals: number; updatedAt: string };

export function alertThresholds() {
  return collection<AlertThreshold>("alert-thresholds");
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
