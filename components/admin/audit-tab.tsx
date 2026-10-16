import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { AuditEntry, Initiator } from "@/lib/contracts";
import { connectorLabel, connectors, toolLabel, toolSurface } from "@/lib/server/tools/registry";
import { USERS, findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { AUDIT_ACTIVITY_KIND, AUDIT_RANGES, auditConnector, auditEntries, inAuditScope, type AuditFilter, type AuditRange } from "@/lib/server/usage";
import { activitiesFrom, actorName, approvalLabel, recipientNames, type Activity } from "@/lib/server/activity";
import { runStore } from "@/lib/harness/runtime";
import { GRANT_AUDIT_TOOL, GUARD_AUDIT_TOOL, SHARE_AUDIT_TOOL, auditLog } from "@/lib/server/audit";
import { untilLabel } from "@/lib/share/grant-label";
import { runSpend } from "@/lib/server/model-ledger";
import { RunTrace } from "./run-trace";
import { AutoSubmitForm } from "./auto-submit-form";
import { Avatar, EmptyLine, FOCUS, GHOST, Panel, Pill, Select, stamp, type Tone } from "./parts";

const AUDIT_PAGE = 60;
const OWN_REASON_TOOLS: ReadonlySet<string> = new Set([GUARD_AUDIT_TOOL, SHARE_AUDIT_TOOL, GRANT_AUDIT_TOOL]);
const DECISIONS: readonly AuditEntry["decision"][] = ["allow", "deny", "masked"];
const DECISION_TONE: Record<AuditEntry["decision"], Tone> = { allow: "success", deny: "danger", masked: "warning" };
const DECISION_WEIGHT: Record<AuditEntry["decision"], number> = { allow: 0, masked: 1, deny: 2 };
const COPY = TH.admin.auditTab;
const VIA_LABELS: Partial<Record<Initiator, string>> = { mcp: COPY.viaMcp, a2a: COPY.viaA2a };

type View = { filter: AuditFilter; range: AuditRange; limit: number };

type TurnGroup = { key: string; entries: AuditEntry[] };

function hrefWith(view: View, change: Partial<{ decision: AuditEntry["decision"] | null; limit: number; activity: boolean }>): string {
  const params = new URLSearchParams({ tab: "audit", range: view.range });
  const decision = change.decision === undefined ? view.filter.decision : change.decision;
  if (view.filter.userId) params.set("user", view.filter.userId);
  if (view.filter.tool) params.set("tool", view.filter.tool);
  if (view.filter.connector) params.set("connector", view.filter.connector);
  if (decision) params.set("decision", decision);
  if (change.limit) params.set("limit", String(change.limit));
  if (change.activity ?? view.filter.activity) params.set("kind", AUDIT_ACTIVITY_KIND);
  return `/admin?${params.toString()}`;
}

/** The audit rows gathered by the turn that made them, in the order each turn first appears: turns of people working at the same time interleave in the log, and each still shows as one row with one key. */
export function turnGroups(entries: readonly AuditEntry[]): TurnGroup[] {
  const byKey = new Map<string, TurnGroup>();
  for (const entry of entries) {
    const key = entry.turnId ?? entry.id;
    const group = byKey.get(key);
    if (group) group.entries.push(entry);
    else byKey.set(key, { key, entries: [entry] });
  }
  return [...byKey.values()];
}

function worstOf(entries: AuditEntry[]): AuditEntry["decision"] {
  return entries.reduce<AuditEntry["decision"]>((worst, entry) => (DECISION_WEIGHT[entry.decision] > DECISION_WEIGHT[worst] ? entry.decision : worst), "allow");
}

function reasonOf(entry: AuditEntry): string | null {
  if (OWN_REASON_TOOLS.has(entry.tool)) return entry.reason ?? null;
  if (entry.decision === "masked") return COPY.maskedReason;
  if (!entry.code) return null;
  return COPY.codes[entry.code] ?? COPY.otherCode(entry.code);
}

function connectorOf(entry: AuditEntry): string | null {
  const id = auditConnector(entry);
  return id ? connectorLabel(id) : null;
}

function DecisionChips({ view, counts }: { view: View; counts: Record<AuditEntry["decision"], number> & { all: number } }) {
  const items: { key: AuditEntry["decision"] | null; label: string; count: number }[] = [
    { key: null, label: TH.admin.filters.all, count: counts.all },
    ...DECISIONS.map((decision) => ({ key: decision, label: TH.admin.decision[decision], count: counts[decision] })),
  ];
  return (
    <div className="flex flex-wrap gap-0.5 rounded-3xl bg-muted p-1">
      {items.map((item) => (
        <Link
          key={item.label}
          href={hrefWith(view, { decision: item.key })}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition",
            FOCUS,
            view.filter.decision === item.key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
          <span className="tabular-nums text-muted-foreground">{item.count.toLocaleString("th-TH")}</span>
        </Link>
      ))}
    </div>
  );
}

function ActivityChip({ view, count }: { view: View; count: number }) {
  const on = view.filter.activity;
  return (
    <Link
      href={hrefWith(view, { activity: !on })}
      aria-pressed={on}
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-2 text-xs font-medium transition",
        FOCUS,
        on ? "bg-primary text-primary-foreground shadow-card" : "bg-muted text-muted-foreground hover:text-foreground",
      )}
    >
      {TH.adminAudit.topic.activity}
      <span className="tabular-nums opacity-80">{count.toLocaleString("th-TH")}</span>
    </Link>
  );
}

function ActivityRow({ activity }: { activity: Activity }) {
  const person = findUser(activity.actorId);
  const name = actorName(activity);
  const to = recipientNames(activity);
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-2xl px-3 py-2.5 hover:bg-muted/40">
      <Avatar name={name} />
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {name}
          <span className="font-normal text-muted-foreground">{` · ${person ? TH.role[person.role] : ""} · ${stamp(activity.at)}`}</span>
        </p>
        <p className="text-[13px] text-foreground">{to ? COPY.activityTo(activity.action, to) : activity.action}</p>
        {activity.subject ? <p className="line-clamp-2 text-[12px] text-muted-foreground">{activity.subject}</p> : null}
        <p className="mt-1">
          <Pill tone={activity.approval.kind === "automatic" ? "neutral" : "success"}>{approvalLabel(activity)}</Pill>
        </p>
      </div>
    </li>
  );
}

function Filters({ view }: { view: View }) {
  const { filter } = view;
  const filtered = filter.userId || filter.tool || filter.connector || filter.decision || filter.activity || view.range !== "7d";
  return (
    <AutoSubmitForm action="/admin" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tab" value="audit" />
      {filter.decision ? <input type="hidden" name="decision" value={filter.decision} /> : null}
      {filter.activity ? <input type="hidden" name="kind" value={AUDIT_ACTIVITY_KIND} /> : null}
      <Select name="range" defaultValue={view.range} aria-label={COPY.range}>
        {AUDIT_RANGES.map((range) => (
          <option key={range} value={range}>
            {`${COPY.range}: ${COPY.ranges[range]}`}
          </option>
        ))}
      </Select>
      <Select name="user" defaultValue={filter.userId ?? ""} aria-label={TH.admin.filters.user}>
        <option value="">{`${TH.admin.filters.user}: ${TH.admin.filters.all}`}</option>
        {USERS.map((person) => (
          <option key={person.id} value={person.id}>
            {person.nameTh}
          </option>
        ))}
      </Select>
      <Select name="connector" defaultValue={filter.connector ?? ""} aria-label={TH.admin.connectors.filter}>
        <option value="">{`${TH.admin.connectors.filter}: ${TH.admin.filters.all}`}</option>
        {connectors().map((connector) => (
          <option key={connector.id} value={connector.id}>
            {connector.labelTh}
          </option>
        ))}
      </Select>
      <Select name="tool" defaultValue={filter.tool ?? ""} aria-label={TH.admin.filters.tool}>
        <option value="">{`${TH.admin.filters.tool}: ${TH.admin.filters.all}`}</option>
        {toolSurface().map((entry) => (
          <option key={entry.name} value={entry.name}>
            {toolLabel(entry.name)}
          </option>
        ))}
      </Select>
      {filtered ? (
        <Link href="/admin?tab=audit" className={GHOST}>
          {TH.admin.filters.clear}
        </Link>
      ) : null}
    </AutoSubmitForm>
  );
}

function CallRow({ entry }: { entry: AuditEntry }) {
  const reason = reasonOf(entry);
  return (
    <li className="flex flex-col gap-1.5 rounded-2xl bg-muted/50 px-3.5 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-sm" title={entry.tool}>
          {toolLabel(entry.tool)}
          <span className="text-[11px] text-muted-foreground">{connectorOf(entry) ? ` · ${connectorOf(entry)}` : ""}</span>
        </p>
        <Pill tone={DECISION_TONE[entry.decision]}>{TH.admin.decision[entry.decision]}</Pill>
      </div>
      {reason ? <p className="text-[12px] text-foreground/80">{entry.reason && entry.reason !== reason ? `${reason} — ${entry.reason}` : reason}</p> : null}
      {entry.grant ? <p className="text-[12px] text-info">{TH.grant.usedBy(findUser(entry.grant.grantorId)?.nameTh ?? entry.grant.grantorId, untilLabel(entry.grant.expiresAt))}</p> : null}
      {entry.args ? (
        <p className="break-all font-mono text-[11px] text-muted-foreground">
          <span className="font-sans">{`${COPY.args}: `}</span>
          {entry.args}
        </p>
      ) : null}
      <p className="text-[11px] tabular-nums text-muted-foreground">{`${stamp(entry.at)} · ${COPY.result(entry.rowsReturned, entry.latencyMs)}`}</p>
    </li>
  );
}

function TurnDetail({ group }: { group: TurnGroup }) {
  const record = group.entries[0].turnId ? runStore().get(group.entries[0].turnId) : null;
  if (record) return <RunTrace record={record} audit={group.entries} spend={runSpend(record.id)} />;
  return (
    <>
      <p className="text-[12px] text-muted-foreground">{TH.admin.trace.none}</p>
      <ul className="flex flex-col gap-1.5">
        {group.entries.map((entry) => (
          <CallRow key={entry.id} entry={entry} />
        ))}
      </ul>
    </>
  );
}

function TurnRow({ group, open }: { group: TurnGroup; open: boolean }) {
  const first = group.entries[0];
  const person = findUser(first.userId);
  const worst = worstOf(group.entries);
  const tools = [...new Set(group.entries.map((entry) => toolLabel(entry.tool)))];
  const byJob = first.initiator === "job";
  const via = first.initiator ? VIA_LABELS[first.initiator] : undefined;
  const headline = first.question ? `“${first.question}”` : byJob ? COPY.jobTitle : tools.join(" · ");
  const reason = worst === "allow" ? null : (group.entries.map(reasonOf).find((text) => text !== null) ?? null);
  return (
    <li>
      <details open={open} id={`run-${group.key}`} className="group scroll-mt-20 rounded-2xl transition open:bg-muted/40 hover:bg-muted/40">
        <summary className={cn("grid cursor-pointer list-none grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 rounded-2xl px-3 py-2.5", FOCUS)}>
          <Avatar name={person?.nameTh ?? first.userId} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">
              {person?.nameTh ?? first.userId}
              <span className="font-normal text-muted-foreground">{` · ${person ? TH.role[person.role] : ""} · ${stamp(first.at)}`}</span>
            </p>
            <p className={cn("line-clamp-2 text-[13px]", first.question || byJob ? "text-foreground" : "text-muted-foreground")}>{headline}</p>
            {first.question || byJob ? <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{`${COPY.calls(group.entries.filter((entry) => entry.tool !== GUARD_AUDIT_TOOL).length)} · ${tools.join(" · ")}`}</p> : null}
            {reason ? <p className={cn("mt-0.5 text-[12px]", worst === "deny" ? "text-danger" : "text-warning")}>{reason}</p> : null}
          </div>
          <span className="flex items-center gap-2">
            {byJob ? <Pill tone="primary">{COPY.byJob}</Pill> : null}
            {via ? <Pill tone="primary">{via}</Pill> : null}
            <Pill tone={DECISION_TONE[worst]}>{TH.admin.decision[worst]}</Pill>
            <ChevronDown className="size-3.5 text-muted-foreground transition group-open:rotate-180" aria-hidden />
          </span>
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3 sm:pl-14">
          <TurnDetail group={group} />
        </div>
      </details>
    </li>
  );
}

function ActivityPanel({ activities }: { activities: Activity[] }) {
  return (
    <Panel title={COPY.activityTitle} hint={COPY.activityHint} bodyClassName="px-2 pb-2 pt-3">
      {activities.length === 0 ? (
        <div className="px-3 pb-3">
          <EmptyLine text={COPY.empty} />
        </div>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {activities.map((activity, index) => (
            <ActivityRow key={`${activity.at}-${index}`} activity={activity} />
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function AuditTab({ filter, range, limit, openRun }: { filter: AuditFilter; range: AuditRange; limit: number; openRun: string | null }) {
  const view: View = { filter, range, limit };
  const all = auditLog().all();
  const activities = activitiesFrom(all.filter((entry) => inAuditScope(entry, { ...filter, activity: true })), filter.since ?? "");
  if (filter.activity) {
    return (
      <div key="activity" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ActivityChip view={view} count={activities.length} />
          <Filters view={view} />
        </div>
        <ActivityPanel activities={activities} />
      </div>
    );
  }
  const scoped = all.filter((entry) => inAuditScope(entry, filter));
  const counts = { all: scoped.length, allow: 0, deny: 0, masked: 0 };
  for (const entry of scoped) counts[entry.decision] += 1;
  const total = counts[filter.decision ?? "all"];
  const entries = auditEntries(filter, limit);
  return (
    <div key="calls" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <ActivityChip view={view} count={activities.length} />
          <DecisionChips view={view} counts={counts} />
        </div>
        <Filters view={view} />
      </div>

      <Panel title={COPY.title} hint={`${COPY.hint} · ${TH.admin.filters.count(entries.length, total)}`} bodyClassName="px-2 pb-2 pt-3">
        {entries.length === 0 ? (
          <div className="px-3 pb-3">
            <EmptyLine text={COPY.empty} />
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {turnGroups(entries).map((group) => (
              <TurnRow key={group.key} group={group} open={group.key === openRun} />
            ))}
          </ul>
        )}
        {entries.length < total ? (
          <div className="flex justify-center px-3 pb-2 pt-3">
            <Link href={hrefWith(view, { limit: limit + AUDIT_PAGE })} className={GHOST}>
              {COPY.more}
            </Link>
          </div>
        ) : null}
      </Panel>
    </div>
  );
}
