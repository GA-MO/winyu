import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { AccessContext, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { presentCard, type SortBy } from "@/lib/cards/present";
import { TODAY, addDays } from "@/lib/data/dates";
import { findUser } from "@/lib/data/entities/users";
import { findPeople } from "@/lib/server/people";
import { teamSpec } from "@/lib/server/mock-people";
import { loadDictionary } from "@/lib/server/master-data";
import { runMetric } from "@/lib/server/metrics";
import { actionsForMetric } from "@/lib/server/next-actions";

const OUTPUT = path.join(process.cwd(), "site", "app", "data", "hero-cards.json");
const PHOTO_SOURCE = path.join(process.cwd(), "public");
const PHOTO_TARGET = path.join(process.cwd(), "site", "public");
const PEOPLE_PHOTOS = path.join(PHOTO_TARGET, "img", "people");

const LAST_THREE_WEEKS = { from: addDays(TODAY, -21), to: TODAY };
const LAST_FULL_MONTH = { from: "2026-08-01", to: "2026-08-31" };
const LAST_TWELVE_WEEKS = { from: addDays(TODAY, -83), to: TODAY };

type MetricCase = { kind: "metric"; id: string; userId: string; title: string; query: MetricQuery; sortBy: SortBy | null };
type PeopleCase = { kind: "people"; id: string; userId: string; title: string; flag: "risk"; departmentId: string };
type HeroCase = MetricCase | PeopleCase;

type RequestLine = { key: string; value: string };

const CASES: HeroCase[] = [
  {
    kind: "metric",
    id: "exec",
    userId: "u_thana",
    title: "รายได้เดือนที่แล้ว แยกตามช่องทาง",
    query: { metric: "net_sales_value", dims: ["channel"], filters: {}, range: LAST_FULL_MONTH, grain: "month", compare: "prev_year", limit: 6 },
    sortBy: null,
  },
  {
    kind: "metric",
    id: "rsm",
    userId: "u_nattaya",
    title: "ยอดขายเข้ารายสัปดาห์",
    query: { metric: "net_sales_volume", dims: ["week"], filters: {}, range: LAST_TWELVE_WEEKS, grain: "week", compare: "prev_year", limit: 20 },
    sortBy: null,
  },
  {
    kind: "metric",
    id: "rep",
    userId: "u_ploy",
    title: "เอเย่นต์ที่ยอดตกมากที่สุด",
    query: { metric: "net_sales_volume", dims: ["agent"], filters: {}, range: LAST_THREE_WEEKS, grain: "month", compare: "prev_period", limit: 5 },
    sortBy: "delta_asc",
  },
  { kind: "people", id: "hr", userId: "u_may", title: "คนที่ควรคุยด้วยก่อนเสียไป · ฝ่ายผลิต", flag: "risk", departmentId: "dept_production" },
];

function accessOf(userId: string): { access: AccessContext; who: string } {
  const user = findUser(userId);
  if (!user) throw new Error(`Unknown persona ${userId}`);
  return { access: accessFor(user), who: `${user.nameTh} · ${user.title}` };
}

async function metricCard(entry: MetricCase) {
  const { access, who } = accessOf(entry.userId);
  const result = await runMetric(entry.query, access);
  if (!result.ok) throw new Error(`${entry.id}: ${result.error}`);
  const parts = presentCard({ title: entry.title, query: entry.query, result, sortBy: entry.sortBy, actions: actionsForMetric(access, entry.query, result, await loadDictionary()) });
  const request: RequestLine[] = [
    { key: "metric", value: entry.query.metric },
    { key: "by", value: entry.query.dims.join(", ") },
  ];
  return { id: entry.id, who, request, scope: result.provenance.scopeApplied, source: result.provenance.sourceSystem, view: { kind: "parts" as const, parts }, photos: [] as string[] };
}

async function peopleCard(entry: PeopleCase) {
  const { access, who } = accessOf(entry.userId);
  const output = await findPeople(access, { region: null, departmentId: entry.departmentId, manager: null, query: null, flag: entry.flag });
  const rows = (output as { data?: { photo?: string }[] }).data ?? [];
  const request: RequestLine[] = [
    { key: "tool", value: "find_people" },
    { key: "flag", value: entry.flag },
    { key: "department", value: entry.departmentId },
  ];
  return {
    id: entry.id,
    who,
    request,
    scope: {} as Record<string, string[]>,
    source: "HRIS",
    view: { kind: "spec" as const, spec: teamSpec(output, entry.title, false) },
    photos: rows.map((row) => row.photo).filter((photo): photo is string => typeof photo === "string"),
  };
}

function copyPhotos(photos: string[]) {
  rmSync(PEOPLE_PHOTOS, { recursive: true, force: true });
  mkdirSync(PEOPLE_PHOTOS, { recursive: true });
  for (const photo of new Set(photos)) copyFileSync(path.join(PHOTO_SOURCE, photo), path.join(PHOTO_TARGET, photo));
}

const cards = await Promise.all(CASES.map((entry) => (entry.kind === "metric" ? metricCard(entry) : peopleCard(entry))));
copyPhotos(cards.flatMap((card) => card.photos));
mkdirSync(path.dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, `${JSON.stringify(cards.map(({ photos: _photos, ...card }) => card), null, 2)}\n`);
for (const card of cards) console.log(card.id, card.view.kind === "parts" ? card.view.parts.body.kind : "spec", card.photos.length, JSON.stringify(card.scope));
