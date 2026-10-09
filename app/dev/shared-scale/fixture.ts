import type { BellItem } from "@/components/notifications/items";
import type { MetricId, Region, User } from "@/lib/contracts";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import type { ReceivedShare, SentShare, ShareChannel } from "@/lib/share/card";
import { sliceLabel, untilLabel } from "@/lib/share/grant-label";
import { notificationTitle } from "@/lib/share/notification-kinds";
import { personaOf } from "@/lib/server/portraits";
import { isLive, type ReceivedState, type ScaleGrant, type ScalePerson, type SentState, type ShareLine } from "./model";

const DAY_MS = 86_400_000;
const ACTIVITY_LIMIT = 40;
const OPENED_AFTER_DAYS = 2;
const UNREAD_WITHIN_DAYS = 2;
const CHANNELS: readonly ShareChannel[] = ["line", "teams", "email"];
const FIX = TH.sharedScale.fixture;

type Card = MetricId | "explain_gap" | "search_documents";

type ReceivedOutcome =
  | { kind: "full" }
  | { kind: "hidden" }
  | { kind: "pending"; approver: string; askedDays: number }
  | { kind: "granted"; by: string; decidedDays: number; expiresInDays: number }
  | { kind: "declined"; by: string; decidedDays: number };

type ReceivedPlan = { from: string; card: Card; days: number[]; outcome: ReceivedOutcome };
type SentPlan = { to: string[]; card: Card; days: number[]; grantExpiresInDays?: number; askedBy?: { id: string; days: number } };

const RECEIVED_PLAN: readonly ReceivedPlan[] = [
  { from: "u_prasit", card: "net_sales_value", days: [0.08, 3, 9, 20], outcome: { kind: "granted", by: "u_prasit", decidedDays: 0.05, expiresInDays: 3 } },
  { from: "u_siriporn", card: "gross_margin", days: [0.3, 12, 41], outcome: { kind: "pending", approver: "u_siriporn", askedDays: 0.2 } },
  { from: "u_wee", card: "stock_on_hand", days: [0.6, 5], outcome: { kind: "full" } },
  { from: "u_ben", card: "campaign_uplift", days: [0.9], outcome: { kind: "hidden" } },
  { from: "u_anucha", card: "target_attainment", days: [1.2, 8, 15, 33], outcome: { kind: "declined", by: "u_prasit", decidedDays: 0.4 } },
  { from: "u_may", card: "attrition_rate", days: [1.6], outcome: { kind: "pending", approver: "u_may", askedDays: 1.5 } },
  { from: "u_kanok", card: "sell_out_volume", days: [2, 6], outcome: { kind: "full" } },
  { from: "u_fah", card: "share_of_voice", days: [2.5], outcome: { kind: "full" } },
  { from: "u_mint", card: "ar_overdue", days: [3.2, 22], outcome: { kind: "granted", by: "u_siriporn", decidedDays: 3, expiresInDays: -1 } },
  { from: "u_krit", card: "net_sales_volume", days: [3.8], outcome: { kind: "full" } },
  { from: "u_prasit", card: "days_of_cover", days: [4.5, 18], outcome: { kind: "full" } },
  { from: "u_oat", card: "capacity_utilization", days: [5.5], outcome: { kind: "full" } },
  { from: "u_siriporn", card: "trade_spend", days: [6.3, 27, 50], outcome: { kind: "granted", by: "u_siriporn", decidedDays: 6, expiresInDays: 10 } },
  { from: "u_wichai", card: "net_sales_value", days: [7.1], outcome: { kind: "full" } },
  { from: "u_pim", card: "campaign_spend", days: [8.4], outcome: { kind: "hidden" } },
  { from: "u_earn", card: "gross_margin", days: [9.7], outcome: { kind: "full" } },
  { from: "u_nattaya", card: "target_attainment", days: [11, 36], outcome: { kind: "full" } },
  { from: "u_ben", card: "sentiment_score", days: [13], outcome: { kind: "full" } },
  { from: "u_wee", card: "production_output", days: [16, 44], outcome: { kind: "full" } },
  { from: "u_saranya", card: "sell_out_volume", days: [19], outcome: { kind: "full" } },
  { from: "u_may", card: "headcount", days: [24], outcome: { kind: "declined", by: "u_may", decidedDays: 23 } },
  { from: "u_prasit", card: "explain_gap", days: [26, 52], outcome: { kind: "full" } },
  { from: "u_mint", card: "forecast_mape", days: [31], outcome: { kind: "full" } },
  { from: "u_fah", card: "campaign_reach", days: [38], outcome: { kind: "full" } },
];

const SENT_PLAN: readonly SentPlan[] = [
  { to: ["u_krit"], card: "net_sales_value", days: [0.08, 1.5, 4, 11], grantExpiresInDays: 3 },
  { to: ["u_prasit", "u_anucha"], card: "target_attainment", days: [0.2, 6] },
  { to: ["u_nok"], card: "net_sales_value", days: [0.7, 9], askedBy: { id: "u_nok", days: 0.4 } },
  { to: ["u_wee", "u_oat"], card: "stock_on_hand", days: [1.1] },
  { to: ["u_ben"], card: "campaign_uplift", days: [1.4, 20] },
  { to: ["u_anucha"], card: "net_sales_volume", days: [2.2, 5, 13], grantExpiresInDays: 6 },
  { to: ["u_ploy"], card: "sell_out_volume", days: [2.9], grantExpiresInDays: -0.5 },
  { to: ["u_may"], card: "attrition_rate", days: [3.5] },
  { to: ["u_kanok", "u_beam"], card: "target_attainment", days: [4.1] },
  { to: ["u_krit"], card: "stock_on_hand", days: [4.8], grantExpiresInDays: 1 },
  { to: ["u_siriporn", "u_mint"], card: "ar_overdue", days: [5.6, 25] },
  { to: ["u_fah"], card: "share_of_voice", days: [6.6] },
  { to: ["u_golf"], card: "net_sales_value", days: [7.5, 17], askedBy: { id: "u_golf", days: 7 } },
  { to: ["u_prasit"], card: "explain_gap", days: [8.3] },
  { to: ["u_wichai"], card: "trade_spend", days: [10, 34], grantExpiresInDays: 12 },
  { to: ["u_arm"], card: "sell_out_volume", days: [12.5] },
  { to: ["u_ice"], card: "net_sales_volume", days: [14], grantExpiresInDays: -2 },
  { to: ["u_wee"], card: "production_output", days: [16.5, 41] },
  { to: ["u_pim", "u_bank"], card: "campaign_spend", days: [19] },
  { to: ["u_ben"], card: "sentiment_score", days: [23] },
  { to: ["u_nattaya"], card: "target_attainment", days: [27, 45] },
  { to: ["u_earn"], card: "gross_margin", days: [32], grantExpiresInDays: -9 },
  { to: ["u_krit"], card: "target_attainment", days: [37] },
  { to: ["u_oat"], card: "capacity_utilization", days: [43] },
  { to: ["u_saranya"], card: "net_sales_value", days: [50, 58] },
];

const WATCH_DAYS = [0.15, 1.3, 2.7, 4, 6.2, 9, 12, 15.5, 21, 29, 40, 55];
const EMAIL_DAYS = [0.4, 1.9, 3.6, 7.8, 11.5, 18, 33, 47];

/** The whole fixture: the viewer, both lists as the new design reads them, and today's three lists over the same shares. */
export type ScaleFixture = {
  viewer: ScalePerson;
  received: ShareLine<ReceivedState>[];
  sent: ShareLine<SentState>[];
  today: { activity: BellItem[]; received: ReceivedShare[]; sent: SentShare[] };
};

function daysAgo(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString();
}

function userOf(id: string): User {
  const user = findUser(id);
  if (!user) throw new Error(`fixture names unknown user ${id}`);
  return user;
}

function personOf(id: string): ScalePerson {
  const persona = personaOf(userOf(id));
  return { id, name: persona.nameTh, photo: persona.photo };
}

function shortName(id: string): string {
  return userOf(id).nameTh.split(" ")[0];
}

function titleOf(card: Card): string {
  if (card === "explain_gap" || card === "search_documents") return TH.share.titles[card];
  return metricLabel(card);
}

function sliceOf(card: Card, holderId: string): string {
  const metric: MetricId = card === "explain_gap" || card === "search_documents" ? "net_sales_value" : card;
  const region: Region | null = userOf(holderId).region;
  return sliceLabel({ metric, regions: region ? [region] : "all", brands: "all" });
}

function receivedState(plan: ReceivedPlan, now: Date): ReceivedState {
  const { outcome } = plan;
  if (outcome.kind === "pending") return { kind: "pending", approverName: shortName(outcome.approver), at: daysAgo(now, outcome.askedDays) };
  if (outcome.kind === "declined") return { kind: "declined", deciderName: shortName(outcome.by), at: daysAgo(now, outcome.decidedDays) };
  if (outcome.kind === "granted" && outcome.expiresInDays > 0) return { kind: "granted", until: untilLabel(daysAgo(now, -outcome.expiresInDays)), at: daysAgo(now, outcome.decidedDays) };
  if (outcome.kind === "full") return { kind: "full" };
  return { kind: "hidden", slice: "" };
}

function receivedLines(viewer: User, now: Date): ShareLine<ReceivedState>[] {
  return RECEIVED_PLAN.flatMap((plan, planIndex) =>
    plan.days.map((days, sendIndex) => {
      const state: ReceivedState = sendIndex === 0 ? receivedState(plan, now) : plan.outcome.kind === "full" ? { kind: "full" } : { kind: "hidden", slice: "" };
      const withSlice: ReceivedState = state.kind === "hidden" ? { kind: "hidden", slice: sliceOf(plan.card, viewer.id) } : state;
      const code = `r${planIndex}-${sendIndex}`;
      const activity = "at" in withSlice ? withSlice.at : daysAgo(now, days);
      return { code, path: `/s/${code}`, title: titleOf(plan.card), people: [personOf(plan.from)], sentAt: daysAgo(now, days), state: withSlice, unread: activity > daysAgo(now, UNREAD_WITHIN_DAYS), grants: [] };
    }),
  );
}

function sentLines(now: Date): ShareLine<SentState>[] {
  return SENT_PLAN.flatMap((plan, planIndex) =>
    plan.days.map((days, sendIndex) => {
      const code = `s${planIndex}-${sendIndex}`;
      const latest = sendIndex === 0;
      const grants: ScaleGrant[] =
        latest && plan.grantExpiresInDays !== undefined
          ? [{ id: `g${planIndex}`, recipientName: shortName(plan.to[0]), slice: sliceOf(plan.card, plan.to[0]), until: untilLabel(daysAgo(now, -plan.grantExpiresInDays)), expiresAt: daysAgo(now, -plan.grantExpiresInDays) }]
          : [];
      const opened = days > OPENED_AFTER_DAYS ? plan.to.length : Math.min(1, plan.to.length - 1);
      const state: SentState = latest && plan.askedBy ? { kind: "asked", requesterName: shortName(plan.askedBy.id), at: daysAgo(now, plan.askedBy.days) } : { kind: "delivered", opened, recipients: plan.to.length };
      const unread = state.kind === "asked" && state.at > daysAgo(now, UNREAD_WITHIN_DAYS);
      return { code, path: `/s/${code}`, title: titleOf(plan.card), people: plan.to.map(personOf), sentAt: daysAgo(now, days), state, unread, grants };
    }),
  );
}

function todayReceived(line: ShareLine<ReceivedState>, viewer: User): ReceivedShare {
  const sender = line.people[0];
  const { state } = line;
  return {
    code: line.code,
    path: line.path,
    title: line.title,
    at: line.sentAt,
    senderName: sender.name,
    note: null,
    hidden: state.kind === "full" || state.kind === "granted" ? null : state.kind === "hidden" ? state.slice : sliceOf("net_sales_value", viewer.id),
    request: state.kind === "pending" ? { approverName: state.approverName } : null,
    grant: state.kind === "granted" ? { grantorName: sender.name, until: state.until } : null,
    unread: line.unread,
  };
}

function todaySent(line: ShareLine<SentState>, now: Date, index: number): SentShare {
  const opened = line.state.kind === "delivered" ? line.state.opened : line.people.length;
  return {
    code: line.code,
    path: line.path,
    title: line.title,
    at: line.sentAt,
    receipts: line.people.map((person, offset) => {
      const via = CHANNELS[(index + offset) % CHANNELS.length];
      return { userId: person.id, name: person.name, asked: via, via, fallback: null };
    }),
    opened,
    recipients: line.people.length,
    grants: line.grants.filter((grant) => isLive(grant, now)).map((grant) => ({ id: grant.id, recipientName: grant.recipientName, slice: grant.slice, until: grant.until })),
  };
}

function shareItems(lines: readonly ShareLine<ReceivedState>[]): BellItem[] {
  return lines.flatMap((line) => {
    const sender = line.people[0];
    const person = { name: sender.name, photo: sender.photo };
    const told: BellItem = { key: `n-${line.code}`, kind: "share", refId: line.code, title: notificationTitle({ kind: "share", refId: line.code, senderName: sender.name, cardTitle: line.title, grantUntil: null }), person, at: line.sentAt, read: !line.unread, target: line.path, notificationId: null };
    const { state } = line;
    if (state.kind === "granted") return [told, { ...told, key: `a-${line.code}`, kind: "grant_approved" as const, title: notificationTitle({ kind: "grant_approved", refId: line.code, approverName: sender.name, slice: line.title, until: state.until }), at: state.at }];
    if (state.kind === "declined") return [told, { ...told, key: `d-${line.code}`, kind: "grant_declined" as const, title: notificationTitle({ kind: "grant_declined", refId: line.code, deciderName: state.deciderName, slice: line.title }), at: state.at }];
    return [told];
  });
}

function outboxItems(now: Date): BellItem[] {
  const watches = WATCH_DAYS.map((days, index): BellItem => ({
    key: `w${index}`,
    kind: "alert",
    refId: `w${index}`,
    title: TH.watch.fired(FIX.watches[index % FIX.watches.length], FIX.hits[index % FIX.hits.length]),
    person: null,
    at: daysAgo(now, days),
    read: days > UNREAD_WITHIN_DAYS,
    target: "/outbox",
    notificationId: null,
  }));
  const senders = ["u_siriporn", "u_prasit", "u_wee", "u_mint", "u_saranya"];
  const emails = EMAIL_DAYS.map((days, index): BellItem => {
    const sender = personOf(senders[index % senders.length]);
    return { key: `e${index}`, kind: "email", refId: `e${index}`, title: FIX.emailTitle(FIX.emails[index % FIX.emails.length]), person: { name: sender.name, photo: sender.photo }, at: daysAgo(now, days), read: days > UNREAD_WITHIN_DAYS, target: "/outbox", notificationId: null };
  });
  return [...watches, ...emails];
}

/** About forty shares each way over sixty days for one viewer, from real people, portraits and card names, with repeats, requests, live and expired grants and unread items. */
export function scaleFixture(viewerId: string, now: Date = new Date()): ScaleFixture {
  const viewer = userOf(viewerId);
  const received = receivedLines(viewer, now);
  const sent = sentLines(now);
  const newestFirst = <T extends { at: string }>(items: T[]) => items.sort((left, right) => right.at.localeCompare(left.at));
  const activity = newestFirst([...shareItems(received), ...outboxItems(now)]).slice(0, ACTIVITY_LIMIT);
  const byNewestSend = <S>(lines: ShareLine<S>[]) => [...lines].sort((left, right) => right.sentAt.localeCompare(left.sentAt));
  return {
    viewer: personOf(viewerId),
    received,
    sent,
    today: { activity, received: byNewestSend(received).map((line) => todayReceived(line, viewer)), sent: byNewestSend(sent).map((line, index) => todaySent(line, now, index)) },
  };
}
