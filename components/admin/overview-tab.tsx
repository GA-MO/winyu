import { Lock, PlugZap, RotateCcw, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { connectorEnabled, handoffEnabled, handoffSwitch, killedTools } from "@/lib/access/enforce";
import { defaultOf, roleOverrides, type RoleOverride, type Visibility } from "@/lib/access/role-overrides";
import { findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { adoptionSummary } from "@/lib/server/adoption";
import { auditEntries, inAuditScope, sinceOf, usageSummary, type AuditFilter } from "@/lib/server/usage";
import { auditLog } from "@/lib/server/audit";
import { connectorHealth } from "@/lib/server/connectors/catalog";
import { connectors, fieldLabel, toolLabel } from "@/lib/server/tools/registry";
import { removeOverrideAction, resetAllAction, setHandoffAction } from "@/app/(app)/admin/actions";
import { SpendStat } from "./spend-stat";
import { Avatar, EmptyLine, GHOST, LinkMore, Panel, Pill, Stat, SystemToggle, stamp } from "./parts";

const RECENT_LIMIT = 6;
const OVERRIDES_SHOWN = 12;
const COPY = TH.admin.overview;
const DENIED_WINDOW = "7d";

function valueLabel(value: Visibility | boolean): string {
  if (typeof value === "boolean") return value ? TH.admin.permission.allow : TH.admin.permission.deny;
  return TH.admin.acl[value];
}

function currentOf(entry: RoleOverride): Visibility | boolean {
  return entry.kind === "tool" ? entry.allowed : entry.visibility;
}

function overrideSubject(entry: RoleOverride): string {
  if (entry.kind === "field") return fieldLabel(entry.key);
  return entry.kind === "metric" ? metricLabel(entry.key) : toolLabel(entry.key);
}

function deniedReason(code: string | undefined): string | null {
  if (!code) return null;
  return TH.admin.auditTab.codes[code] ?? TH.admin.auditTab.otherCode(code);
}

/** The handoff switch as one row, shared by the overview and the tools tab. */
export function HandoffSwitchRow() {
  const enabled = handoffEnabled();
  const entry = handoffSwitch();
  const copy = TH.admin.handoffSwitch;
  return (
    <form action={setHandoffAction} className="flex items-center gap-4">
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <SystemIcon icon={Send} tone={enabled ? "on" : "off"} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-medium">{copy.title}</p>
          <Pill tone={enabled ? "success" : "danger"}>{enabled ? copy.on : copy.off}</Pill>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{copy.body}</p>
        {entry ? <p className="mt-0.5 text-[11px] text-muted-foreground">{copy.changed(findUser(entry.by)?.nameTh ?? entry.by, stamp(entry.at))}</p> : null}
      </div>
      <SystemToggle on={enabled} onLabel={TH.admin.connectors.shutAll} offLabel={TH.admin.connectors.reopen} />
    </form>
  );
}

function SystemIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: "on" | "off" | "neutral" }) {
  const color = tone === "on" ? "bg-success/12 text-success" : tone === "off" ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground";
  return (
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-2xl ${color}`}>
      <Icon className="size-[18px]" aria-hidden />
    </span>
  );
}

function SystemRow({ icon, title, value, names, tone, href }: { icon: LucideIcon; title: string; value: string; names: string[]; tone: "on" | "off" | "neutral"; href: string }) {
  return (
    <div className="flex items-center gap-4">
      <SystemIcon icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{value}</p>
        {names.length > 0 ? (
          <p className="mt-1.5 flex flex-wrap gap-1.5">
            {names.map((name) => (
              <Pill key={name} tone="danger">
                {name}
              </Pill>
            ))}
          </p>
        ) : null}
      </div>
      <LinkMore href={href}>{COPY.manage}</LinkMore>
    </div>
  );
}

function ConnectorProblems() {
  const problems = connectors().flatMap((connector) => {
    if (!connectorEnabled(connector.id)) return [`${connector.labelTh} · ${COPY.connectorOff}`];
    if (connector.kind === "mcp" && connectorHealth(connector.id) === "offline") return [`${connector.labelTh} · ${COPY.connectorDown}`];
    return [];
  });
  return (
    <SystemRow
      icon={PlugZap}
      title={COPY.connectorsTitle}
      value={problems.length > 0 ? COPY.killedSome(problems.length) : COPY.connectorsFine}
      names={problems}
      tone={problems.length > 0 ? "off" : "neutral"}
      href="/admin?tab=tools"
    />
  );
}

function OverrideRow({ entry }: { entry: RoleOverride }) {
  return (
    <li className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
      <Avatar name={findUser(entry.by)?.nameTh ?? entry.by} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          <span className="font-medium">{TH.role[entry.role]}</span>
          <span className="text-muted-foreground">{` · ${COPY.kinds[entry.kind]} · ${overrideSubject(entry)}`}</span>
        </p>
        <p className="text-[12px]">{COPY.overrideChange(valueLabel(defaultOf(entry)), valueLabel(currentOf(entry)))}</p>
        <p className="text-[11px] text-muted-foreground">{TH.admin.overrides.changedBy(findUser(entry.by)?.nameTh ?? entry.by, stamp(entry.at))}</p>
      </div>
      <form action={removeOverrideAction}>
        <input type="hidden" name="override" value={entry.id} />
        <button type="submit" className={GHOST}>
          <RotateCcw className="size-3.5" aria-hidden />
          {COPY.revert}
        </button>
      </form>
    </li>
  );
}

function Overrides() {
  const all = [...roleOverrides()].sort((left, right) => right.at.localeCompare(left.at));
  const action =
    all.length > 0 ? (
      <form action={resetAllAction}>
        <button type="submit" className={GHOST}>
          {COPY.revertAll(all.length)}
        </button>
      </form>
    ) : null;
  return (
    <Panel title={COPY.overrides} hint={COPY.overridesHint} action={action}>
      {all.length === 0 ? (
        <EmptyLine text={COPY.overridesEmpty} />
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {all.slice(0, OVERRIDES_SHOWN).map((entry) => (
            <OverrideRow key={entry.id} entry={entry} />
          ))}
        </ul>
      )}
      {all.length > OVERRIDES_SHOWN ? (
        <div className="pt-3">
          <LinkMore href="/admin?tab=access&view=matrix">{COPY.seeAll}</LinkMore>
        </div>
      ) : null}
    </Panel>
  );
}

function RecentDenied() {
  const denied = auditEntries({ userId: null, tool: null, connector: null, decision: "deny", since: null }, RECENT_LIMIT);
  if (denied.length === 0) return <EmptyLine text={COPY.recentDeniedEmpty} />;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {denied.map((entry) => {
        const person = findUser(entry.userId);
        return (
          <li key={entry.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
            <Avatar name={person?.nameTh ?? entry.userId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {person?.nameTh ?? entry.userId}
                <span className="font-normal text-muted-foreground">{` · ${toolLabel(entry.tool)}`}</span>
              </p>
              {deniedReason(entry.code) ? <p className="text-[12px] text-danger">{deniedReason(entry.code)}</p> : null}
              {entry.question ? <p className="truncate text-[11px] text-muted-foreground">{`“${entry.question}”`}</p> : null}
            </div>
            <p className="shrink-0 text-[11px] text-muted-foreground">{stamp(entry.at)}</p>
          </li>
        );
      })}
    </ul>
  );
}

function deniedThisWeek(): { denied: number; calls: number } {
  const filter: AuditFilter = { userId: null, tool: null, connector: null, decision: null, since: sinceOf(DENIED_WINDOW) };
  const entries = auditLog().all().filter((entry) => inAuditScope(entry, filter));
  return { denied: entries.filter((entry) => entry.decision === "deny").length, calls: entries.length };
}

export function OverviewTab() {
  const usage = usageSummary();
  const adoption = adoptionSummary();
  const active = adoption.activeByRole.reduce((sum, entry) => sum + entry.active, 0);
  const people = adoption.activeByRole.reduce((sum, entry) => sum + entry.total, 0);
  const questions = usage.perDay.reduce((sum, point) => sum + point.count, 0);
  const killed = killedTools();
  const week = deniedThisWeek();
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={COPY.active} value={active.toLocaleString("th-TH")} sub={COPY.activeOf(active, people)} tone="success" href="/admin?tab=usage" />
        <Stat label={COPY.questions} value={questions.toLocaleString("th-TH")} tone="primary" href="/admin?tab=usage" />
        <Stat
          label={COPY.denied}
          value={week.denied.toLocaleString("th-TH")}
          sub={COPY.deniedSub(week.calls)}
          tone={week.denied > 0 ? "danger" : "neutral"}
          href={`/admin?tab=audit&decision=deny&range=${DENIED_WINDOW}`}
        />
        <SpendStat spend={usage.spend} />
      </div>

      <Panel title={COPY.system} hint={COPY.systemHint} bodyClassName="flex flex-col gap-4">
        <HandoffSwitchRow />
        <div className="h-px bg-border" />
        <SystemRow
          icon={Lock}
          title={COPY.killedTools}
          value={killed.length > 0 ? COPY.killedSome(killed.length) : COPY.killedNone}
          names={killed.map((name) => toolLabel(name))}
          tone={killed.length > 0 ? "off" : "neutral"}
          href="/admin?tab=tools"
        />
        <div className="h-px bg-border" />
        <ConnectorProblems />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Overrides />
        <Panel title={COPY.recentDenied} action={<LinkMore href="/admin?tab=audit&decision=deny">{COPY.seeAll}</LinkMore>}>
          <RecentDenied />
        </Panel>
      </div>
    </div>
  );
}
