import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { METRIC_IDS, ROLE_IDS, TOOL_SURFACE, type RoleId, type ToolName } from "@/lib/contracts";
import { ROLE_POLICIES, accessFor } from "@/lib/access/policies";
import { killTool, killedTools, reviveTool } from "@/lib/access/enforce";
import { auditLog } from "@/lib/server/audit";
import { packets } from "@/lib/server/agent/collections";
import { threads } from "@/lib/server/threads-read";
import { USERS, findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { readUser } from "@/lib/server/session";

type SearchParams = Promise<{ tab?: string; as?: string }>;

const TABS = ["users", "tools", "audit", "usage", "simulate"] as const;
const AUDIT_LIMIT = 40;
const CELL = "whitespace-nowrap px-2.5 py-1.5 text-xs";
const TABLE = "w-full min-w-max border-collapse text-left";
const HEAD = "border-b border-border/60 text-xs font-medium text-muted-foreground";
const PANEL = "overflow-x-auto rounded-2xl border border-border/70 bg-card/60 p-3 backdrop-blur";

type Tab = (typeof TABS)[number];

function tabOf(value: string | undefined): Tab {
  return TABS.includes(value as Tab) ? (value as Tab) : "users";
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
  const { tab, as } = await searchParams;
  const current = tabOf(tab);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10 sm:px-8">
        <header className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            <GradientText>{TH.admin.title}</GradientText>
          </h1>
        </header>

        <nav className="flex flex-wrap items-center gap-1">
          {TABS.map((item) => (
            <Link
              key={item}
              href={`/admin?tab=${item}`}
              className={`rounded-lg px-3 py-1.5 text-sm transition ${item === current ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {TH.admin.tabs[item]}
            </Link>
          ))}
          <Link href="/outbox" className="ml-auto rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition hover:text-foreground">
            {TH.outbox.title}
          </Link>
        </nav>

        {user.role !== "it_admin" ? (
          <p className="rounded-2xl border border-border/70 bg-card/60 p-6 text-sm text-muted-foreground">{TH.admin.denied}</p>
        ) : (
          <>
            {current === "users" ? <UsersTab /> : null}
            {current === "tools" ? <ToolsTab /> : null}
            {current === "audit" ? <AuditTab /> : null}
            {current === "usage" ? <UsageTab /> : null}
            {current === "simulate" ? <SimulateTab userId={as ?? USERS[0].id} /> : null}
          </>
        )}
      </div>
    </div>
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
              <tr key={person.id} className="border-b border-border/40">
                <td className={CELL}>{person.nameTh}</td>
                <td className={CELL}>{TH.role[person.role]}</td>
                <td className={CELL}>{person.region ? TH.region[person.region] : TH.region.all}</td>
                <td className={CELL}>{ROLE_POLICIES[person.role].toolAllow.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="text-sm font-medium text-muted-foreground">{TH.admin.metricAcl}</h2>
      <div className={PANEL}>
        <table className={TABLE}>
          <thead>
            <tr className={HEAD}>
              <th className={CELL}>Metric</th>
              {ROLE_IDS.map((role) => (
                <th key={role} className={CELL}>
                  {TH.role[role]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRIC_IDS.map((metric) => (
              <tr key={metric} className="border-b border-border/40">
                <td className={CELL}>{metricLabel(metric)}</td>
                {ROLE_IDS.map((role) => (
                  <td key={`${metric}-${role}`} className={CELL}>
                    {TH.admin.acl[ROLE_POLICIES[role].metricAcl[metric]]}
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

function ToolsTab() {
  const killed = new Set(killedTools());
  return (
    <div className={PANEL}>
      <table className={TABLE}>
        <thead>
          <tr className={HEAD}>
            <th className={CELL}>Tool</th>
            <th className={CELL}>Tier</th>
            {ROLE_IDS.map((role) => (
              <th key={role} className={CELL}>
                {TH.role[role]}
              </th>
            ))}
            <th className={CELL}>{TH.admin.killSwitch}</th>
          </tr>
        </thead>
        <tbody>
          {TOOL_SURFACE.map((entry) => {
            const isKilled = killed.has(entry.name);
            return (
              <tr key={entry.name} className="border-b border-border/40">
                <td className={CELL}>{entry.name}</td>
                <td className={CELL}>{entry.tier}</td>
                {ROLE_IDS.map((role) => (
                  <td key={`${entry.name}-${role}`} className={CELL}>
                    {entry.roles === "all" || entry.roles.includes(role as RoleId) ? "✓" : "—"}
                  </td>
                ))}
                <td className={CELL}>
                  <form action={toggleTool}>
                    <input type="hidden" name="tool" value={entry.name} />
                    <input type="hidden" name="killed" value={String(isKilled)} />
                    <button type="submit" className={`rounded-lg border px-2 py-1 text-xs transition ${isKilled ? "border-danger/60 text-danger" : "border-border/70 text-muted-foreground hover:text-foreground"}`}>
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

function AuditTab() {
  const entries = auditLog()
    .all()
    .sort((left, right) => right.at.localeCompare(left.at))
    .slice(0, AUDIT_LIMIT);
  return (
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
            <tr key={entry.id} className="border-b border-border/40">
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
    </div>
  );
}

function UsageTab() {
  const entries = auditLog().all();
  const counters = [
    { label: TH.admin.usage.tools, value: entries.length },
    { label: TH.admin.usage.denied, value: entries.filter((entry) => entry.decision === "deny").length },
    { label: TH.admin.usage.masked, value: entries.filter((entry) => entry.decision === "masked").length },
    { label: TH.admin.usage.questions, value: threads().all().length },
    { label: TH.admin.usage.packets, value: packets().all().length },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {counters.map((counter) => (
        <div key={counter.label} className="rounded-2xl border border-border/70 bg-card/60 p-4 backdrop-blur">
          <p className="text-xs text-muted-foreground">{counter.label}</p>
          <p className="mt-1 font-display text-2xl font-semibold">{counter.value}</p>
        </div>
      ))}
    </div>
  );
}

function SimulateTab({ userId }: { userId: string }) {
  const target = findUser(userId) ?? USERS[0];
  const access = accessFor(target);
  return (
    <div className="flex flex-col gap-4">
      <form className="flex flex-wrap items-center gap-2" action="/admin">
        <input type="hidden" name="tab" value="simulate" />
        <label className="text-sm text-muted-foreground" htmlFor="as">
          {TH.admin.simulate}
        </label>
        <select id="as" name="as" defaultValue={target.id} className="rounded-lg border border-border/70 bg-card/60 px-2 py-1.5 text-sm">
          {USERS.map((person) => (
            <option key={person.id} value={person.id}>
              {person.nameTh} · {TH.role[person.role]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-lg border border-border/70 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground">
          {TH.common.confirm}
        </button>
      </form>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
          <h2 className="text-sm font-medium">{TH.admin.simulateScope}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {access.regions === "all" ? TH.region.all : access.regions.map((region) => TH.region[region]).join(", ")}
          </p>
        </div>
        <div className="rounded-2xl border border-border/70 bg-card/60 p-4">
          <h2 className="text-sm font-medium">{TH.admin.simulateTools}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{access.toolAllow.join(", ")}</p>
        </div>
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
            {METRIC_IDS.map((metric) => (
              <tr key={metric} className="border-b border-border/40">
                <td className={CELL}>{metricLabel(metric)}</td>
                <td className={CELL}>{TH.admin.acl[access.metricAcl[metric]]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
