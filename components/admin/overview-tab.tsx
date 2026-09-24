import { Lock, ShieldCheck, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { handoffEnabled, handoffSwitch, killedTools } from "@/lib/access/enforce";
import { roleOverrides, type RoleOverride } from "@/lib/access/role-overrides";
import { findUser } from "@/lib/data/entities/users";
import { metricLabel } from "@/lib/dashboard/metric-display";
import { TH } from "@/lib/i18n/th";
import { adoptionSummary } from "@/lib/server/adoption";
import { auditEntries, usageSummary } from "@/lib/server/usage";
import { setHandoffAction } from "@/app/(app)/admin/actions";
import { Avatar, EmptyLine, LinkMore, Panel, Pill, Stat, SwitchButton, stamp } from "./parts";
import { toolLabel } from "@/lib/server/tools/registry";

const RECENT_LIMIT = 6;
const COPY = TH.admin.overview;

function costLabel(costUsd: number): string {
  return costUsd > 0 ? `$${costUsd.toFixed(2)}` : TH.admin.usage.free;
}

function overrideValue(entry: RoleOverride): string {
  if (entry.kind === "metric") return TH.admin.acl[entry.visibility];
  return entry.allowed ? TH.admin.permission.allow : TH.admin.permission.deny;
}

function overrideSubject(entry: RoleOverride): string {
  return entry.kind === "metric" ? metricLabel(entry.key) : toolLabel(entry.key);
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
      <SwitchButton on={enabled} label={enabled ? copy.turnOff : copy.turnOn} />
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

function SystemRow({ icon, title, value, tone, href }: { icon: LucideIcon; title: string; value: string; tone: "on" | "off" | "neutral"; href: string }) {
  return (
    <div className="flex items-center gap-4">
      <SystemIcon icon={icon} tone={tone} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{value}</p>
      </div>
      <LinkMore href={href}>{COPY.manage}</LinkMore>
    </div>
  );
}

function RecentChanges() {
  const recent = [...roleOverrides()].sort((left, right) => right.at.localeCompare(left.at)).slice(0, RECENT_LIMIT);
  if (recent.length === 0) return <EmptyLine text={COPY.recentChangesEmpty} />;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {recent.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
          <Avatar name={findUser(entry.by)?.nameTh ?? entry.by} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">
              <span className="font-medium">{TH.role[entry.role]}</span>
              <span className="text-muted-foreground"> · {overrideSubject(entry)}</span>
            </p>
            <p className="text-[11px] text-muted-foreground">{stamp(entry.at)}</p>
          </div>
          <Pill tone="primary">{overrideValue(entry)}</Pill>
        </li>
      ))}
    </ul>
  );
}

function RecentDenied() {
  const denied = auditEntries({ userId: null, tool: null, decision: "deny" }, RECENT_LIMIT);
  if (denied.length === 0) return <EmptyLine text={COPY.recentDeniedEmpty} />;
  return (
    <ul className="flex flex-col divide-y divide-border">
      {denied.map((entry) => {
        const person = findUser(entry.userId);
        return (
          <li key={entry.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Avatar name={person?.nameTh ?? entry.userId} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{person?.nameTh ?? entry.userId}</p>
              <p className="truncate text-[11px] text-muted-foreground">{person ? TH.role[person.role] : ""}</p>
            </div>
            <div className="text-right">
              <p className="text-xs">{toolLabel(entry.tool)}</p>
              <p className="text-[11px] text-muted-foreground">{stamp(entry.at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function OverviewTab() {
  const usage = usageSummary();
  const adoption = adoptionSummary();
  const active = adoption.activeByRole.reduce((sum, entry) => sum + entry.active, 0);
  const people = adoption.activeByRole.reduce((sum, entry) => sum + entry.total, 0);
  const questions = usage.perDay.reduce((sum, point) => sum + point.count, 0);
  const killed = killedTools().length;
  const overrides = roleOverrides().length;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={COPY.active} value={active.toLocaleString("th-TH")} sub={COPY.activeOf(active, people)} tone="success" href="/admin?tab=usage" />
        <Stat label={COPY.questions} value={questions.toLocaleString("th-TH")} sub={TH.admin.usage.tokens(usage.inputTokens, usage.outputTokens)} tone="primary" href="/admin?tab=usage" />
        <Stat label={COPY.denied} value={usage.denied.toLocaleString("th-TH")} sub={COPY.deniedSub} tone={usage.denied > 0 ? "danger" : "neutral"} href="/admin?tab=audit&decision=deny" />
        <Stat label={COPY.cost} value={costLabel(usage.costUsd)} sub={usage.costUsd > 0 ? TH.admin.usage.costNote(usage.modelId) : TH.admin.usage.freeNote} />
      </div>

      <Panel title={COPY.system} hint={COPY.systemHint} bodyClassName="flex flex-col gap-4">
        <HandoffSwitchRow />
        <div className="h-px bg-border" />
        <SystemRow icon={Lock} title={COPY.killedTools} value={killed > 0 ? COPY.killedSome(killed) : COPY.killedNone} tone={killed > 0 ? "off" : "neutral"} href="/admin?tab=tools" />
        <div className="h-px bg-border" />
        <SystemRow icon={ShieldCheck} title={COPY.overrides} value={overrides > 0 ? COPY.overridesSome(overrides) : COPY.overridesNone} tone="neutral" href="/admin?tab=access" />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={COPY.recentChanges} action={<LinkMore href="/admin?tab=access">{COPY.seeAll}</LinkMore>}>
          <RecentChanges />
        </Panel>
        <Panel title={COPY.recentDenied} action={<LinkMore href="/admin?tab=audit&decision=deny">{COPY.seeAll}</LinkMore>}>
          <RecentDenied />
        </Panel>
      </div>
    </div>
  );
}
