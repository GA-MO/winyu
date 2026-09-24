import Link from "next/link";
import { Lock, RotateCcw } from "lucide-react";
import { cn } from "vexa/lib/utils";
import { METRIC_IDS, ROLE_IDS, type RoleId, type ToolName, type ToolSurfaceEntry } from "@/lib/contracts";
import { connectorFields, connectorLabel, surfaceByConnector, toolSurface } from "@/lib/server/tools/registry";
import { METRIC_DOMAINS, ROLE_POLICIES } from "@/lib/access/policies";
import { killedTools } from "@/lib/access/enforce";
import { fieldVisibilityOf, isGrantable, overrideFor, permissionsFor, roleOverrides, type RoleOverride, type Visibility } from "@/lib/access/role-overrides";
import { USERS, findUser } from "@/lib/data/entities/users";
import { metricDef } from "@/lib/semantic/metrics";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { cycleFieldAction, cycleMetricAction, resetAllAction, resetRoleAction, setFieldAction, setMetricAction, setRoleToolAction } from "@/app/(app)/admin/actions";
import { ConnectorHeader } from "./connector-parts";
import { Avatar, FOCUS, GHOST, Panel, Pill, SwitchButton, stamp } from "./parts";

const COPY = TH.admin.access;
const LEVELS: readonly Visibility[] = ["full", "masked", "none"];
const MEMBERS_SHOWN = 6;
const LEVEL_ACTIVE: Record<Visibility, string> = {
  full: "bg-success text-ink-foreground shadow-card",
  masked: "bg-warning text-ink-foreground shadow-card",
  none: "bg-ink text-ink-foreground shadow-card",
};
const MARK: Record<Visibility, { glyph: string; tone: string }> = {
  full: { glyph: "●", tone: "text-success" },
  masked: { glyph: "◐", tone: "text-warning" },
  none: { glyph: "○", tone: "text-muted-foreground" },
};

function changedTitle(override: RoleOverride | null): string | undefined {
  if (!override) return undefined;
  return TH.admin.overrides.changedBy(findUser(override.by)?.nameTh ?? override.by, stamp(override.at));
}

function RolePicker({ current, view }: { current: RoleId; view: "role" | "matrix" }) {
  return (
    <div className="flex flex-col-reverse gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {view === "role"
          ? ROLE_IDS.map((role) => {
              const count = USERS.filter((user) => user.role === role).length;
              const changed = roleOverrides().some((entry) => entry.role === role);
              const active = role === current;
              return (
                <Link
                  key={role}
                  href={`/admin?tab=access&role=${role}`}
                  className={cn(
                    "relative inline-flex h-9 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm transition",
                    FOCUS,
                    active ? "border-transparent bg-ink text-ink-foreground" : "border-border bg-card text-muted-foreground shadow-card hover:text-foreground",
                  )}
                >
                  {TH.role[role]}
                  <span className={cn("text-xs tabular-nums", active ? "text-ink-foreground/70" : "text-muted-foreground")}>{count}</span>
                  {changed ? <span className="absolute right-1 top-1 size-1.5 rounded-full bg-primary" aria-hidden /> : null}
                </Link>
              );
            })
          : null}
      </div>
      <div className="flex shrink-0 self-start rounded-full bg-muted p-1">
        {(["role", "matrix"] as const).map((item) => (
          <Link
            key={item}
            href={`/admin?tab=access&view=${item}&role=${current}`}
            className={cn("rounded-full px-3 py-1.5 text-xs font-medium transition", FOCUS, item === view ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground")}
          >
            {item === "role" ? COPY.byRole : COPY.compare}
          </Link>
        ))}
      </div>
    </div>
  );
}

function RoleHeader({ role }: { role: RoleId }) {
  const members = USERS.filter((user) => user.role === role);
  const permissions = permissionsFor(role);
  const counts = LEVELS.map((level) => METRIC_IDS.filter((id) => permissions.metricAcl[id] === level).length);
  const changed = roleOverrides().filter((entry) => entry.role === role).length;
  return (
    <Panel bodyClassName="flex flex-wrap items-center justify-between gap-5">
      <div className="flex min-w-0 items-center gap-4">
        <div className="flex -space-x-2">
          {members.slice(0, MEMBERS_SHOWN).map((member) => (
            <Avatar key={member.id} name={member.nameTh} size="lg" />
          ))}
          {members.length > MEMBERS_SHOWN ? (
            <span className="inline-flex size-11 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground ring-2 ring-card">+{members.length - MEMBERS_SHOWN}</span>
          ) : null}
        </div>
        <div className="min-w-0">
          <h2 className="font-display text-xl font-semibold tracking-tight">{TH.role[role]}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {COPY.members(members.length)} · {ROLE_POLICIES[role].regions === "own" ? COPY.scopeOwn : COPY.scopeAll}
          </p>
          <p className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone="success">{`${TH.admin.aclShort.full} ${counts[0]}`}</Pill>
            <Pill tone="warning">{`${TH.admin.aclShort.masked} ${counts[1]}`}</Pill>
            <Pill>{`${TH.admin.aclShort.none} ${counts[2]}`}</Pill>
            <Pill tone="primary">{COPY.toolCount(permissions.toolAllow.length, toolSurface().length)}</Pill>
          </p>
        </div>
      </div>
      {changed > 0 ? (
        <form action={resetRoleAction}>
          <input type="hidden" name="role" value={role} />
          <button type="submit" className={GHOST}>
            <RotateCcw className="size-3.5" aria-hidden />
            {COPY.resetRole(changed)}
          </button>
        </form>
      ) : null}
    </Panel>
  );
}

type Subject = { name: "metric" | "field"; key: string };

function LevelControl({ role, subject, value }: { role: RoleId; subject: Subject; value: Visibility }) {
  return (
    <form action={subject.name === "metric" ? setMetricAction : setFieldAction} className="flex shrink-0 rounded-full bg-muted p-0.5">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name={subject.name} value={subject.key} />
      {LEVELS.map((level) => (
        <button
          key={level}
          type="submit"
          name="visibility"
          value={level}
          aria-pressed={level === value}
          title={TH.admin.aclExplain[level]}
          className={cn(
            "rounded-full px-2.5 py-1 text-[11px] font-medium transition sm:px-3",
            FOCUS,
            level === value ? LEVEL_ACTIVE[level] : "text-muted-foreground hover:text-foreground",
          )}
        >
          {TH.admin.aclShort[level]}
        </button>
      ))}
    </form>
  );
}

function MetricList({ role }: { role: RoleId }) {
  const permissions = permissionsFor(role);
  return (
    <Panel title={COPY.metrics} hint={COPY.metricsHint} className="lg:col-span-3" bodyClassName="flex flex-col gap-5">
      <dl className="grid gap-2 rounded-2xl bg-muted/60 p-3.5 sm:grid-cols-3" aria-label={COPY.legend}>
        {LEVELS.map((level) => (
          <div key={level} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs font-semibold">
              <span className={MARK[level].tone} aria-hidden>
                {MARK[level].glyph}
              </span>
              {TH.admin.aclShort[level]}
            </dt>
            <dd className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{TH.admin.aclExplain[level]}</dd>
          </div>
        ))}
      </dl>
      {METRIC_DOMAINS.map((domain) => (
        <div key={domain.id} className="flex flex-col">
          <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">{TH.admin.domain[domain.id]}</p>
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {domain.metrics.map((metric) => {
              const override = overrideFor(role, "metric", metric);
              const def = metricDef(metric);
              return (
                <li key={metric} className="flex items-center gap-3 px-3.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 truncate text-sm">
                      {metricLabel(metric)}
                      {override ? (
                        <Pill tone="primary" title={changedTitle(override)}>
                          {COPY.changed}
                        </Pill>
                      ) : null}
                    </p>
                    {def ? <p className="truncate text-[11px] text-muted-foreground">{def.sourceSystem}</p> : null}
                  </div>
                  <LevelControl role={role} subject={{ name: "metric", key: metric }} value={permissions.metricAcl[metric]} />
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <FieldList role={role} />
    </Panel>
  );
}

function FieldList({ role }: { role: RoleId }) {
  const fields = connectorFields();
  if (fields.length === 0) return null;
  return (
    <div className="flex flex-col">
      <p className="pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground">{TH.admin.connectors.fields}</p>
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {fields.map((field) => {
          const override = overrideFor(role, "field", field.key);
          return (
            <li key={field.key} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm">
                  {field.labelTh}
                  {override ? (
                    <Pill tone="primary" title={changedTitle(override)}>
                      {COPY.changed}
                    </Pill>
                  ) : null}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{connectorLabel(field.connector)}</p>
              </div>
              <LevelControl role={role} subject={{ name: "field", key: field.key }} value={fieldVisibilityOf(role, field.key)} />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ToolRow({ role, entry, on, killed }: { role: RoleId; entry: ToolSurfaceEntry; on: boolean; killed: boolean }) {
  const locked = !on && !isGrantable(role, entry.name);
  const override = overrideFor(role, "tool", entry.name);
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5 text-sm">
          {entry.labelTh}
          {override ? (
            <Pill tone="primary" title={changedTitle(override)}>
              {COPY.changed}
            </Pill>
          ) : null}
          {killed ? <Pill tone="danger">{COPY.killedEverywhere}</Pill> : null}
        </p>
        <p className="truncate font-mono text-[11px] text-muted-foreground">{entry.name}</p>
      </div>
      {locked ? (
        <span title={TH.admin.overrides.notGrantable} className="inline-flex size-6 items-center justify-center text-muted-foreground">
          <Lock className="size-3.5" aria-hidden />
        </span>
      ) : (
        <form action={setRoleToolAction}>
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="tool" value={entry.name} />
          <input type="hidden" name="allowed" value={String(!on)} />
          <SwitchButton on={on} label={`${entry.labelTh}: ${on ? TH.admin.permission.allow : TH.admin.permission.deny}`} />
        </form>
      )}
    </li>
  );
}

function ToolList({ role }: { role: RoleId }) {
  const allowed = new Set(permissionsFor(role).toolAllow);
  const killed = new Set(killedTools());
  return (
    <Panel title={COPY.toolsTitle} hint={COPY.toolsHint} className="lg:col-span-2" bodyClassName="flex flex-col gap-5">
      {surfaceByConnector().map((group) => (
        <div key={group.connector.id} className="flex flex-col">
          <div className="border-b border-border pb-2">
            <ConnectorHeader connector={group.connector} compact />
          </div>
          <ul className="flex flex-col divide-y divide-border">
            {group.tools.map((entry) => (
              <ToolRow key={entry.name} role={role} entry={entry} on={allowed.has(entry.name)} killed={killed.has(entry.name)} />
            ))}
          </ul>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{COPY.askHint}</p>
    </Panel>
  );
}

function MatrixCell({ role, subject, value }: { role: RoleId; subject: Subject; value: Visibility }) {
  const override = overrideFor(role, subject.name, subject.key);
  const mark = MARK[value];
  return (
    <form action={subject.name === "metric" ? cycleMetricAction : cycleFieldAction}>
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name={subject.name} value={subject.key} />
      <button
        type="submit"
        title={[TH.admin.acl[value], changedTitle(override)].filter(Boolean).join(" · ")}
        className={cn("inline-flex size-7 items-center justify-center rounded-lg text-sm transition", FOCUS, mark.tone, override ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted")}
      >
        {mark.glyph}
      </button>
    </form>
  );
}

function ToolMatrixCell({ role, tool, on }: { role: RoleId; tool: ToolName; on: boolean }) {
  const override = overrideFor(role, "tool", tool);
  if (!on && !isGrantable(role, tool)) {
    return (
      <span title={TH.admin.overrides.notGrantable} className="inline-flex size-7 items-center justify-center text-muted-foreground/50">
        <Lock className="size-3" aria-hidden />
      </span>
    );
  }
  return (
    <form action={setRoleToolAction}>
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="tool" value={tool} />
      <input type="hidden" name="allowed" value={String(!on)} />
      <button
        type="submit"
        title={[on ? TH.admin.permission.allow : TH.admin.permission.deny, changedTitle(override)].filter(Boolean).join(" · ")}
        className={cn("inline-flex size-7 items-center justify-center rounded-lg text-sm transition", FOCUS, on ? "text-success" : "text-muted-foreground", override ? "bg-primary/10 ring-1 ring-primary/40" : "hover:bg-muted")}
      >
        {on ? "✓" : "—"}
      </button>
    </form>
  );
}

function FieldMatrixRows() {
  const fields = connectorFields();
  if (fields.length === 0) return null;
  return (
    <tbody>
      <tr>
        <td colSpan={ROLE_IDS.length + 1} className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-wide text-muted-foreground">
          {TH.admin.connectors.fields}
        </td>
      </tr>
      {fields.map((field) => (
        <tr key={field.key} className="border-t border-border">
          <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1">{field.labelTh}</td>
          {ROLE_IDS.map((role) => (
            <td key={role} className="px-1 py-1 text-center">
              <MatrixCell role={role} subject={{ name: "field", key: field.key }} value={fieldVisibilityOf(role, field.key)} />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

function Matrix() {
  const permissions = Object.fromEntries(ROLE_IDS.map((role) => [role, permissionsFor(role)])) as Record<RoleId, ReturnType<typeof permissionsFor>>;
  const total = roleOverrides().length;
  const head = (
    <tr className="text-[11px] font-medium text-muted-foreground">
      <th className="sticky left-0 z-10 bg-card px-3 py-2 text-left font-medium" />
      {ROLE_IDS.map((role) => (
        <th key={role} className="px-1 py-2 text-center font-medium" title={TH.role[role]}>
          {TH.roleShort[role]}
        </th>
      ))}
    </tr>
  );
  return (
    <Panel
      title={COPY.compare}
      hint={COPY.compareHint}
      action={
        total > 0 ? (
          <form action={resetAllAction}>
            <button type="submit" className={GHOST}>
              <RotateCcw className="size-3.5" aria-hidden />
              {TH.admin.overrides.reset(total)}
            </button>
          </form>
        ) : null
      }
      bodyClassName="overflow-x-auto"
    >
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>{head}</thead>
        {METRIC_DOMAINS.map((domain) => (
          <tbody key={domain.id}>
            <tr>
              <td colSpan={ROLE_IDS.length + 1} className="px-3 pb-1 pt-4 text-[11px] font-semibold tracking-wide text-muted-foreground">
                {TH.admin.domain[domain.id]}
              </td>
            </tr>
            {domain.metrics.map((metric) => (
              <tr key={metric} className="border-t border-border">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1">{metricLabel(metric)}</td>
                {ROLE_IDS.map((role) => (
                  <td key={role} className="px-1 py-1 text-center">
                    <MatrixCell role={role} subject={{ name: "metric", key: metric }} value={permissions[role].metricAcl[metric]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
        <FieldMatrixRows />
        <tbody>
          <tr>
            <td colSpan={ROLE_IDS.length + 1} className="px-3 pb-1 pt-5 text-[11px] font-semibold tracking-wide text-muted-foreground">
              {COPY.toolsTitle}
            </td>
          </tr>
        </tbody>
        {surfaceByConnector().map((group) => (
          <tbody key={group.connector.id}>
            <tr className="border-t border-border bg-muted/40">
              <td colSpan={ROLE_IDS.length + 1} className="px-3 py-2">
                <div className="sticky left-3 max-w-md">
                  <ConnectorHeader connector={group.connector} compact />
                </div>
              </td>
            </tr>
            {group.tools.map((entry) => (
              <tr key={entry.name} className="border-t border-border">
                <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-3 py-1">{entry.labelTh}</td>
                {ROLE_IDS.map((role) => (
                  <td key={role} className="px-1 py-1 text-center">
                    <ToolMatrixCell role={role} tool={entry.name} on={permissions[role].toolAllow.includes(entry.name)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </Panel>
  );
}

export function AccessTab({ role, view }: { role: RoleId; view: "role" | "matrix" }) {
  return (
    <div className="flex flex-col gap-4">
      <RolePicker current={role} view={view} />
      {view === "matrix" ? (
        <Matrix />
      ) : (
        <>
          <RoleHeader role={role} />
          <div className="grid items-start gap-4 lg:grid-cols-5">
            <MetricList role={role} />
            <ToolList role={role} />
          </div>
        </>
      )}
    </div>
  );
}
