import type { Alert, ContextPacket, DashboardLayout, Forecast, MemoryFact, Notification, OutboxEntry } from "@/lib/contracts";
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
