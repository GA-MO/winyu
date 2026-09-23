import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { METRIC_IDS, ROLE_IDS, TOOL_SURFACE, type AuditEntry, type Dim, type MetricId, type RoleId, type ToolName } from "@/lib/contracts";
import { ROLE_POLICIES, accessFor } from "@/lib/access/policies";
import { killTool, killedTools, reviveTool } from "@/lib/access/enforce";
import { runMetric } from "@/lib/data/query";
import { TIME_DIMS, metricDef } from "@/lib/semantic/metrics";
import { USERS, findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { readUser } from "@/lib/server/session";
import { auditEntries, usageSummary, type UsageSummary } from "@/lib/server/usage";
import { adoptionSummary, percentOf } from "@/lib/server/adoption";
import { auditLog } from "@/lib/server/audit";

type SearchParams = Promise<{ tab?: string; as?: string; metric?: string; user?: string; tool?: string; decision?: string }>;

const TABS = ["users", "tools", "audit", "usage", "simulate"] as const;
const DECISIONS = ["allow", "deny", "masked"] as const;
const AUDIT_LIMIT = 40;
const SIMULATE_ROWS = 6;
const SIMULATE_RANGE = { from: "2026-09-01", to: "2026-09-22" };
const CELL = "whitespace-nowrap px-2.5 py-1.5 text-xs";
const NARROW = "px-1.5 py-1.5 text-center text-xs";
const TABLE = "w-full border-collapse text-left text-xs";
const HEAD = "border-b border-border text-xs font-medium text-muted-foreground";
const PANEL = "overflow-x-auto rounded-2xl border border-border bg-card p-3 shadow-card";
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const FIELD = `rounded-full border border-border bg-card px-3 py-1.5 text-sm ${FOCUS}`;
const BUTTON = `rounded-full border border-border bg-card px-3.5 py-1.5 text-sm text-muted-foreground transition hover:text-foreground ${FOCUS}`;

type Tab = (typeof TABS)[number];

function tabOf(value: string | undefined): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "users";
}

function metricOf(value: string | undefined): MetricId {
  return METRIC_IDS.includes(value as MetricId) ? (value as MetricId) : "net_sales_volume";
}

function decisionOf(value: string | undefined): AuditEntry["decision"] | null {
  return DECISIONS.includes(value as AuditEntry["decision"]) ? (value as AuditEntry["decision"]) : null;
}

function textOf(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

export const dynamic = "force-dynamic";

async function toggleTool(formData: FormData) {
  "use server";
  const user = readUser(await cookies());
  if (!user || user.role !== "it_admin") return;
  const tool = String(formData.get("tool")) as ToolName;
  if (String(formData.get("killed")) === "true") reviveTool(tool);
  else killTool(tool, user.id);
  revalidatePath("/admin");
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  const params = await searchParams;
  const current = tabOf(params.tab);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-[-0.02em]">
            <GradientText>{TH.admin.title}</GradientText>
          </h1>
        </header>

        <nav className="flex flex-wrap items-center gap-1">
          {TABS.map((item) => (
            <Link
              key={item}
              href={`/admin?tab=${item}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${FOCUS} ${item === current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {TH.admin.tabs[item]}
            </Link>
          ))}
          <Link href="/outbox" className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground">
            {TH.outbox.title}
          </Link>
        </nav>

        {user.role !== "it_admin" ? (
          <p className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">{TH.admin.denied}</p>
        ) : (
          <>
            {current === "users" ? <UsersTab /> : null}
            {current === "tools" ? <ToolsTab /> : null}
            {current === "audit" ? <AuditTab userId={textOf(params.user)} tool={textOf(params.tool)} decision={decisionOf(params.decision)} /> : null}
            {current === "usage" ? <UsageTab /> : null}
            {current === "simulate" ? <SimulateTab userId={params.as ?? USERS[0].id} metric={metricOf(params.metric)} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

function RoleColumns() {
  return (
    <>
      {ROLE_IDS.map((role) => (
        <th key={role} className={NARROW} title={TH.role[role]}>
          {TH.roleShort[role]}
        </th>
      ))}
    </>
  );
}

function UsersTab() {
  return (
    <div className="flex flex-col gap-4">
      <div className={PANEL}>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD}>
              <th className={CELL}>ผู้ใช้</th>
              <th className={CELL}>บทบาท</th>
              <th className={CELL}>ภาค</th>
              <th className={CELL}>เครื่องมือ</th>
            </tr>
          </thead>
          <tbody>
            {USERS.map((person) => (
              <tr key={person.id} className="border-b border-border">
                <td className={CELL}>{person.nameTh}</td>
                <td className={CELL}>{TH.role[person.role]}</td>
                <td className={CELL}>{person.region ? TH.region[person.region] : TH.region.all}</td>
                <td className={CELL}>{ROLE_POLICIES[person.role].toolAllow.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{TH.admin.metricAcl}</h2>
        <p className="text-xs text-muted-foreground">{TH.admin.aclLegend}</p>
      </div>
      <div className={PANEL}>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD}>
              <th className={CELL}>Metric</th>
              <RoleColumns />
            </tr>
          </thead>
          <tbody>
            {METRIC_IDS.map((metric) => (
              <tr key={metric} className="border-b border-border">
                <td className={CELL}>{metricLabel(metric)}</td>
                {ROLE_IDS.map((role) => (
                  <td key={`${metric}-${role}`} className={NARROW}>
                    <AclMark value={ROLE_POLICIES[role].metricAcl[metric]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AclMark({ value }: { value: "full" | "masked" | "none" }) {
  const tone = value === "full" ? "text-success" : value === "masked" ? "text-warning" : "text-muted-foreground";
  const mark = value === "full" ? "●" : value === "masked" ? "◐" : "○";
  return (
    <span className={tone} title={TH.admin.acl[value]}>
      {mark}
    </span>
  );
}

function ToolsTab() {
  const killed = new Set(killedTools());
  return (
    <div className={PANEL}>
      <table className={TABLE}>
        <thead>
          <tr className={HEAD}>
            <th className={CELL}>Tool</th>
            <th className={NARROW}>Tier</th>
            <RoleColumns />
            <th className={NARROW}>{TH.admin.killSwitch}</th>
          </tr>
        </thead>
        <tbody>
          {TOOL_SURFACE.map((entry) => {
            const isKilled = killed.has(entry.name);
            return (
              <tr key={entry.name} className="border-b border-border">
                <td className={CELL}>{entry.name}</td>
                <td className={NARROW}>{entry.tier}</td>
                {ROLE_IDS.map((role) => (
                  <td key={`${entry.name}-${role}`} className={NARROW}>
                    {entry.roles === "all" || entry.roles.includes(role as RoleId) ? <span className="text-success">✓</span> : <span className="text-muted-foreground">—</span>}
                  </td>
                ))}
                <td className={NARROW}>
                  <form action={toggleTool}>
                    <input type="hidden" name="tool" value={entry.name} />
                    <input type="hidden" name="killed" value={String(isKilled)} />
                    <button type="submit" className={`rounded-full border px-2.5 py-1 text-xs transition ${FOCUS} ${isKilled ? "border-danger/60 text-danger" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {isKilled ? TH.admin.killed : TH.admin.live}
                    </button>
                  </form>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AuditTab({ userId, tool, decision }: { userId: string | null; tool: string | null; decision: AuditEntry["decision"] | null }) {
  const total = auditLog().all().length;
  const entries = auditEntries({ userId, tool, decision }, AUDIT_LIMIT);
  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-center gap-2" action="/admin">
        <input type="hidden" name="tab" value="audit" />
        <select name="user" defaultValue={userId ?? ""} className={FIELD} aria-label={TH.admin.filters.user}>
          <option value="">{`${TH.admin.filters.user}: ${TH.admin.filters.all}`}</option>
          {USERS.map((person) => (
            <option key={person.id} value={person.id}>
              {person.nameTh}
            </option>
          ))}
        </select>
        <select name="tool" defaultValue={tool ?? ""} className={FIELD} aria-label={TH.admin.filters.tool}>
          <option value="">{`${TH.admin.filters.tool}: ${TH.admin.filters.all}`}</option>
          {TOOL_SURFACE.map((entry) => (
            <option key={entry.name} value={entry.name}>
              {entry.name}
            </option>
          ))}
        </select>
        <select name="decision" defaultValue={decision ?? ""} className={FIELD} aria-label={TH.admin.filters.decision}>
          <option value="">{`${TH.admin.filters.decision}: ${TH.admin.filters.all}`}</option>
          {DECISIONS.map((value) => (
            <option key={value} value={value}>
              {TH.admin.decision[value]}
            </option>
          ))}
        </select>
        <button type="submit" className={BUTTON}>
          {TH.admin.filters.apply}
        </button>
        <Link href="/admin?tab=audit" className={BUTTON}>
          {TH.admin.filters.clear}
        </Link>
        <span className="text-xs text-muted-foreground">{TH.admin.filters.count(entries.length, total)}</span>
      </form>

      <div className={PANEL}>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD}>
              <th className={CELL}>{TH.admin.auditColumns.at}</th>
              <th className={CELL}>{TH.admin.auditColumns.user}</th>
              <th className={CELL}>{TH.admin.auditColumns.tool}</th>
              <th className={CELL}>{TH.admin.auditColumns.decision}</th>
              <th className={CELL}>{TH.admin.auditColumns.rows}</th>
              <th className={CELL}>{TH.admin.auditColumns.latency}</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border">
                <td className={CELL}>{`${formatDateTh(entry.at)} ${formatTimeTh(entry.at)}`}</td>
                <td className={CELL}>{findUser(entry.userId)?.nameTh ?? entry.userId}</td>
                <td className={CELL}>{entry.tool}</td>
                <td className={CELL}>{TH.admin.decision[entry.decision]}</td>
                <td className={CELL}>{entry.rowsReturned}</td>
                <td className={CELL}>{entry.latencyMs}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {entries.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{TH.admin.usage.none}</p> : null}
      </div>
    </div>
  );
}

function Counter({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold">{value}</p>
    </div>
  );
}

function QuestionsPerDay({ summary }: { summary: UsageSummary }) {
  const peak = Math.max(1, ...summary.perDay.map((point) => point.count));
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
      <p className="text-xs text-muted-foreground">{TH.admin.usage.perDay}</p>
      <div className="mt-3 flex h-24 items-end gap-1">
        {summary.perDay.map((point) => (
          <div key={point.day} className="flex flex-1 flex-col items-center gap-1" title={`${formatDateTh(point.day)} · ${point.count}`}>
            <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.round((point.count / peak) * 100)}%`, minHeight: point.count > 0 ? "4px" : "1px" }} />
            <span className="text-[0.6rem] text-muted-foreground">{point.day.slice(8)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdoptionPanel() {
  const adoption = adoptionSummary();
  const fate = adoption.alerts;
  const acted = percentOf(fate.total - fate.untouched, fate.total);
  const PANEL_CARD = "rounded-2xl border border-border bg-card p-4 shadow-card";
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-sm font-semibold">{TH.admin.adoption.title}</h2>
        <p className="text-xs text-muted-foreground">{TH.admin.adoption.note}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <div className={PANEL_CARD}>
          <p className="text-xs text-muted-foreground">{TH.admin.adoption.activeByRole}</p>
          <ul className="mt-3 flex flex-col gap-1.5">
            {adoption.activeByRole.map((entry) => (
              <li key={entry.role} className="flex items-center gap-3 text-sm">
                <span className="w-36 shrink-0 truncate">{TH.role[entry.role]}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <span className="block h-full rounded-full bg-primary" style={{ width: `${percentOf(entry.active, entry.total)}%` }} />
                </span>
                <span className="w-10 shrink-0 text-right tabular-nums text-muted-foreground">
                  {entry.active}/{entry.total}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className={PANEL_CARD}>
          <p className="text-xs text-muted-foreground">{TH.admin.adoption.alerts}</p>
          <p className="mt-1 font-display text-2xl font-semibold">{TH.admin.adoption.acted(acted)}</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
            {(
              [
                ["handedOff", fate.handedOff],
                ["closed", fate.closed],
                ["opened", fate.opened],
                ["untouched", fate.untouched],
              ] as const
            ).map(([key, count]) => (
              <div key={key}>
                <dt className="text-xs text-muted-foreground">{TH.admin.adoption[key]}</dt>
                <dd className="tabular-nums">{count}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className={PANEL_CARD}>
          <p className="text-xs text-muted-foreground">{TH.admin.adoption.handoffs}</p>
          <p className="mt-1 text-sm">{TH.admin.adoption.handoffLine(adoption.handoffs.resolved, adoption.handoffs.total, adoption.handoffs.returned)}</p>
          <p className="text-xs text-muted-foreground">{TH.admin.adoption.replyTime(adoption.handoffs.medianHoursToReply)}</p>
        </div>
        <div className={PANEL_CARD}>
          <p className="text-xs text-muted-foreground">{TH.admin.adoption.cards}</p>
          <p className="mt-1 text-sm">{adoption.cards.judged ? TH.admin.adoption.cardsLine(adoption.cards.viewed, adoption.cards.pinned) : TH.admin.adoption.cardsWaiting}</p>
          <p className="mt-3 text-xs text-muted-foreground">{TH.admin.adoption.watches}</p>
          <p className="mt-1 text-sm">{TH.admin.adoption.watchLine(adoption.watches.active, adoption.watches.triggered, adoption.watches.notified, adoption.watches.digests)}</p>
        </div>
      </div>
    </section>
  );
}

function UsageTab() {
  const summary = usageSummary();
  const cost = summary.costUsd > 0 ? `$${summary.costUsd.toFixed(2)}` : TH.admin.usage.free;
  return (
    <div className="flex flex-col gap-4">
      <AdoptionPanel />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Counter label={TH.admin.usage.questions} value={summary.questions} />
        <Counter label={TH.admin.usage.tools} value={summary.toolCalls} />
        <Counter label={TH.admin.usage.denied} value={summary.denied} />
        <Counter label={TH.admin.usage.masked} value={summary.masked} />
        <Counter label={TH.admin.usage.empty} value={summary.emptyResults} />
        <Counter label={TH.admin.usage.packets} value={summary.packets} />
      </div>

      <QuestionsPerDay summary={summary} />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">{TH.admin.usage.topIntents}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.topIntents.map((intent) => (
              <li key={intent.intentKey} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{intent.intentKey}</span>
                <span className="text-muted-foreground">{intent.count}</span>
              </li>
            ))}
          </ul>
          {summary.topIntents.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{TH.admin.usage.none}</p> : null}
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <p className="text-xs text-muted-foreground">{TH.admin.usage.unanswered}</p>
          <p className="mt-1 text-xs text-muted-foreground">{TH.admin.usage.unansweredNote}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {summary.unanswered.map((question) => (
              <li key={`${question.at}-${question.prompt}`} className="text-sm">
                <span className="line-clamp-2">{question.prompt}</span>
                <span className="text-xs text-muted-foreground">{findUser(question.userId)?.nameTh ?? question.userId}</span>
              </li>
            ))}
          </ul>
          {summary.unanswered.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">{TH.admin.usage.none}</p> : null}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
        <p className="text-xs text-muted-foreground">{TH.admin.usage.cost}</p>
        <p className="mt-1 font-display text-2xl font-semibold">{cost}</p>
        <p className="mt-1 text-xs text-muted-foreground">{TH.admin.usage.tokens(summary.inputTokens, summary.outputTokens)}</p>
        <p className="text-xs text-muted-foreground">{TH.admin.usage.costNote(summary.modelId)}</p>
      </div>
    </div>
  );
}

function breakdownDimOf(metric: MetricId): Dim {
  const def = metricDef(metric);
  return def?.dims.find((dim) => !TIME_DIMS.includes(dim)) ?? "month";
}

function SimulateTab({ userId, metric }: { userId: string; metric: MetricId }) {
  const target = findUser(userId) ?? USERS[0];
  const access = accessFor(target);
  const dim = breakdownDimOf(metric);
  const result = runMetric(
    { metric, dims: [dim], filters: {}, range: SIMULATE_RANGE, grain: "month", compare: "none", limit: SIMULATE_ROWS },
    access,
  );
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-center gap-2" action="/admin">
        <input type="hidden" name="tab" value="simulate" />
        <label className="text-sm text-muted-foreground" htmlFor="as">
          {TH.admin.simulate}
        </label>
        <select id="as" name="as" defaultValue={target.id} className={FIELD}>
          {USERS.map((person) => (
            <option key={person.id} value={person.id}>
              {person.nameTh} · {TH.role[person.role]}
            </option>
          ))}
        </select>
        <select name="metric" defaultValue={metric} className={FIELD} aria-label={TH.admin.simulateMetric}>
          {METRIC_IDS.map((id) => (
            <option key={id} value={id}>
              {metricLabel(id)}
            </option>
          ))}
        </select>
        <button type="submit" className={BUTTON}>
          {TH.common.confirm}
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-medium">{TH.admin.simulateScope}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {access.regions === "all" ? TH.region.all : access.regions.map((region) => TH.region[region]).join(", ")}
          </p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-4 shadow-card">
          <h2 className="text-sm font-medium">{TH.admin.simulateTools}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{access.toolAllow.join(", ")}</p>
        </div>
      </div>

      <div className={PANEL}>
        <h2 className="px-1 pb-2 text-sm font-medium">{TH.admin.simulateRun}</h2>
        {result.ok ? (
          <>
            <p className="px-1 pb-3 text-xs text-muted-foreground">{result.summary}</p>
            <table className={TABLE}>
              <thead>
                <tr className={HEAD}>
                  <th className={CELL}>{dim}</th>
                  <th className={CELL}>{metricLabel(metric)}</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={String(row[dim])} className="border-b border-border">
                    <td className={CELL}>{String(row[dim])}</td>
                    <td className={CELL}>{String(row.value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {result.provenance.masked.length > 0 ? (
              <p className="px-1 pt-3 text-xs text-warning">{TH.admin.simulateMasked(result.provenance.masked.length)}</p>
            ) : null}
          </>
        ) : (
          <p className="px-1 py-3 text-sm text-danger">{`${TH.admin.simulateDenied}: ${result.error}`}</p>
        )}
      </div>

      <div className={PANEL}>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD}>
              <th className={CELL}>Metric</th>
              <th className={CELL}>{TH.admin.metricAcl}</th>
            </tr>
          </thead>
          <tbody>
            {METRIC_IDS.map((id) => (
              <tr key={id} className="border-b border-border">
                <td className={CELL}>{metricLabel(id)}</td>
                <td className={CELL}>{TH.admin.acl[access.metricAcl[id]]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
