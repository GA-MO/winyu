import { AlertTriangle, Ban } from "lucide-react";
import { ROLE_IDS, type Dim, type MetricId, type MetricRow } from "@/lib/contracts";
import { METRIC_DOMAINS } from "@/lib/access/policies";
import { liveAccessFor } from "@/lib/access/enforce";
import { ports } from "@/lib/server/ports";
import { TIME_DIMS, metricDef } from "@/lib/semantic/metrics";
import { USERS, findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { Avatar, INK, Panel, Pill, Select, type Tone } from "./parts";
import { surfaceByConnector } from "@/lib/server/tools/registry";

const SIMULATE_ROWS = 6;
const SIMULATE_RANGE = { from: "2026-09-01", to: "2026-09-22" };
const ACL_TONE: Record<"full" | "masked" | "none", Tone> = { full: "success", masked: "warning", none: "neutral" };

function breakdownDimOf(metric: MetricId): Dim {
  return metricDef(metric)?.dims.find((dim) => !TIME_DIMS.includes(dim)) ?? "month";
}

function numberOf(row: MetricRow): number | null {
  return typeof row.value === "number" ? row.value : null;
}

function ResultRows({ rows, dim }: { rows: MetricRow[]; dim: Dim }) {
  const peak = Math.max(1, ...rows.map((row) => Math.abs(numberOf(row) ?? 0)));
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => {
        const value = numberOf(row);
        return (
          <li key={String(row[dim])} className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 text-sm">
            <span className="truncate">{String(row[dim])}</span>
            <span className="h-2 overflow-hidden rounded-full bg-muted">
              {value === null ? null : <span className="block h-full rounded-full bg-primary" style={{ width: `${(Math.abs(value) / peak) * 100}%` }} />}
            </span>
            <span className="text-right text-xs font-medium tabular-nums">{String(row.value_label ?? row.value)}</span>
          </li>
        );
      })}
    </ul>
  );
}

export async function SimulateTab({ userId, metric }: { userId: string; metric: MetricId }) {
  const target = findUser(userId) ?? USERS[0];
  const access = liveAccessFor(target);
  const dim = breakdownDimOf(metric);
  const result = await ports().metrics.runMetric({ metric, dims: [dim], filters: {}, range: SIMULATE_RANGE, grain: "month", compare: "none", limit: SIMULATE_ROWS }, access);
  const scope = access.regions === "all" ? TH.region.all : access.regions.map((region) => TH.region[region]).join(", ");
  return (
    <div className="flex flex-col gap-4">
      <Panel title={TH.admin.simulate} hint={TH.admin.simulateHint}>
        <form className="flex flex-wrap items-center gap-2" action="/admin">
          <input type="hidden" name="tab" value="simulate" />
          <Select name="as" defaultValue={target.id} className="flex-1 sm:flex-none" aria-label={TH.admin.simulate}>
            {ROLE_IDS.map((role) => (
              <optgroup key={role} label={TH.role[role]}>
                {USERS.filter((person) => person.role === role).map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.nameTh} · {person.title}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <Select name="metric" defaultValue={metric} className="flex-1 sm:flex-none" aria-label={TH.admin.simulateMetric}>
            {METRIC_DOMAINS.map((domain) => (
              <optgroup key={domain.id} label={TH.admin.domain[domain.id]}>
                {domain.metrics.map((id) => (
                  <option key={id} value={id}>
                    {metricLabel(id)}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <button type="submit" className={INK}>
            {TH.admin.simulateGo}
          </button>
        </form>
      </Panel>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <div className="flex flex-col gap-4 lg:col-span-3">
          <Panel bodyClassName="flex items-center gap-4">
            <Avatar name={target.nameTh} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg font-semibold tracking-tight">{target.nameTh}</p>
              <p className="truncate text-xs text-muted-foreground">
                {target.title} · {TH.role[target.role]}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-muted-foreground">{TH.admin.simulateScope}</p>
              <p className="text-sm font-medium">{scope}</p>
            </div>
          </Panel>

          <Panel title={`${TH.admin.simulateRun} “${metricLabel(metric)}”`} hint={result.ok ? result.headline.periodLabel : undefined}>
            {result.ok ? (
              <div className="flex flex-col gap-4">
                <p className="font-display text-[2rem] font-semibold leading-none tracking-[-0.03em] tabular-nums">{result.headline.value}</p>
                <ResultRows rows={result.rows} dim={dim} />
                {result.provenance.masked.length > 0 ? (
                  <p className="flex items-center gap-2 rounded-2xl bg-warning/10 px-3.5 py-2.5 text-xs text-warning">
                    <AlertTriangle className="size-4 shrink-0" aria-hidden />
                    {TH.admin.simulateMasked(result.provenance.masked.length)}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="flex items-start gap-3 rounded-2xl bg-danger/8 px-4 py-3.5">
                <Ban className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-danger">{TH.admin.simulateDenied}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{result.error}</p>
                </div>
              </div>
            )}
          </Panel>

          <Panel title={TH.admin.simulateTools} bodyClassName="flex flex-col gap-3">
            {surfaceByConnector().map(({ connector, tools }) => {
              const callable = tools.filter((entry) => access.toolAllow.includes(entry.name));
              if (callable.length === 0) return null;
              return (
                <div key={connector.id}>
                  <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">{connector.labelTh}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {callable.map((entry) => (
                      <span key={entry.name} className="rounded-full bg-bubble px-2.5 py-1 text-xs text-accent-foreground">
                        {entry.labelTh}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </Panel>
        </div>

        <Panel title={TH.admin.simulateAcl} className="lg:col-span-2" bodyClassName="flex flex-col gap-4">
          {METRIC_DOMAINS.map((domain) => (
            <div key={domain.id}>
              <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">{TH.admin.domain[domain.id]}</p>
              <ul className="flex flex-col gap-1.5">
                {domain.metrics.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3 text-sm">
                    <span className={`truncate ${id === metric ? "font-medium" : ""}`}>{metricLabel(id)}</span>
                    <Pill tone={ACL_TONE[access.metricAcl[id]]}>{TH.admin.aclShort[access.metricAcl[id]]}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Panel>
      </div>
    </div>
  );
}
