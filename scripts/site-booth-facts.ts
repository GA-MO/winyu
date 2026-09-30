import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Alert, MetricQuery } from "@/lib/contracts";
import { accessFor } from "@/lib/access/policies";
import { findUser, USERS } from "@/lib/data/entities/users";
import { AGENTS } from "@/lib/data/entities/agents";
import { TODAY, addDays } from "@/lib/data/dates";
import { formatDateTh } from "@/lib/i18n/format";
import { runMetric } from "@/lib/server/metrics";

const DATA_DIR = path.join(process.cwd(), ".data");
const OUTPUT = path.join(process.cwd(), "site", "app", "data", "booth-facts.json");
const SPINE_AGENTS = ["ag_nea_05", "ag_nea_02"];
const SPINE_PATTERN = /วงเงิน|อุบลศรีสุข|อีสานรุ่งโรจน์/;
const LESSON_ID = "demo_outcome_ubon_credit";
const DAILY_FROM = addDays(TODAY, -30);
const VIEWER = "u_prasit";
const BANGKOK_TIME = new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" });

type Story = { kind: "urgent" | "watch" | "ok"; finding: string; scope: string; ruledOut: { text: string }[]; action: string | null };
type Investigation = { userId: string; at: string; checkedCount: number; stories: Story[] };
type Outcome = { id: string; verdict: "real" | "noise"; outcome: string; at: string };

function readData<T>(file: string): T {
  return JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8")) as T;
}

function spineStoryOf(record: Investigation): Story | null {
  return record.stories.find((story) => SPINE_PATTERN.test(`${story.finding} ${story.action ?? ""}`) && /อีสาน/.test(`${story.finding} ${story.scope}`)) ?? null;
}

function roles() {
  const investigations = readData<Investigation[]>("investigations.json");
  return investigations
    .map((record) => {
      const user = findUser(record.userId);
      if (!user) throw new Error(`Unknown persona ${record.userId}`);
      const story = spineStoryOf(record);
      return {
        userId: user.id,
        role: user.title,
        department: user.department,
        managerId: user.managerId,
        ranAt: BANGKOK_TIME.format(new Date(record.at)),
        checked: record.checkedCount,
        spine: story ? { kind: story.kind, scope: story.scope, finding: story.finding, ruledOut: story.ruledOut.map((cause) => cause.text), action: story.action } : null,
      };
    })
    .sort((left, right) => left.ranAt.localeCompare(right.ranAt));
}

async function dailyOrders() {
  const access = accessFor(findUser(VIEWER)!);
  return Promise.all(
    SPINE_AGENTS.map(async (agent) => {
      const query: MetricQuery = { metric: "net_sales_volume", dims: ["date"], filters: { agent: [agent] }, range: { from: DAILY_FROM, to: TODAY }, grain: "day", compare: "none", limit: 60 };
      const result = await runMetric(query, access);
      if (!result.ok) throw new Error(`${agent}: ${result.error}`);
      const rows = result.rows as { date?: string; value?: number; net_sales_volume?: number }[];
      return {
        agent: AGENTS.find((entry) => entry.id === agent)?.nameTh ?? agent,
        points: rows.map((row) => ({ date: String(row.date), litres: Math.round(Number(row.value ?? row.net_sales_volume ?? 0)) })),
      };
    }),
  );
}

function alert() {
  const found = readData<Alert[]>("alerts.json").find((entry) => entry.dims.agent === SPINE_AGENTS[0] && entry.severity === "P1");
  if (!found) throw new Error("No P1 alert for the spine agent");
  return { severity: found.severity, observed: found.observed, expected: found.expected, zScore: found.zScore, hypothesis: found.hypothesis, ownerRole: findUser(found.ownerUserId)?.title ?? null };
}

function lesson() {
  const outcome = readData<Outcome[]>("alert-outcomes.json").find((entry) => entry.id === LESSON_ID);
  if (!outcome) throw new Error(`No lesson ${LESSON_ID}`);
  return { verdict: outcome.verdict, outcome: outcome.outcome, date: formatDateTh(outcome.at) };
}

const people = roles();
const facts = {
  asOf: formatDateTh(TODAY),
  totals: {
    roles: people.length,
    spineRoles: people.filter((person) => person.spine).length,
    checked: people.reduce((sum, person) => sum + person.checked, 0),
    firstRun: people[0].ranAt,
    lastRun: people[people.length - 1].ranAt,
  },
  roles: people,
  orgEdges: USERS.filter((user) => user.managerId && people.some((person) => person.userId === user.id)).map((user) => [user.managerId, user.id]),
  dailyOrders: await dailyOrders(),
  alert: alert(),
  lesson: lesson(),
};

writeFileSync(OUTPUT, `${JSON.stringify(facts, null, 2)}\n`);
console.log(`roles ${facts.totals.roles} · spine ${facts.totals.spineRoles} · checked ${facts.totals.checked} · ${facts.totals.firstRun}–${facts.totals.lastRun}`);
console.log(`daily: ${facts.dailyOrders.map((series) => `${series.agent} ${series.points.length} pts`).join(" | ")}`);
