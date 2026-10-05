import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { AuditEntry } from "@/lib/contracts";
import { connectorLabel, connectors, toolLabel, toolSurface } from "@/lib/server/tools/registry";
import { USERS, findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { AUDIT_RANGES, auditConnector, auditEntries, inAuditScope, type AuditFilter, type AuditRange } from "@/lib/server/usage";
import { runStore } from "@/lib/harness/runtime";
import { GUARD_AUDIT_TOOL, auditLog } from "@/lib/server/audit";
import { runSpend } from "@/lib/server/model-ledger";
import { RunTrace } from "./run-trace";
import { AutoSubmitForm } from "./auto-submit-form";
import { Avatar, EmptyLine, FOCUS, GHOST, Panel, Pill, Select, stamp, type Tone } from "./parts";

const AUDIT_PAGE = 60;
const DECISIONS: readonly AuditEntry["decision"][] = ["allow", "deny", "masked"];
const DECISION_TONE: Record<AuditEntry["decision"], Tone> = { allow: "success", deny: "danger", masked: "warning" };
const DECISION_WEIGHT: Record<AuditEntry["decision"], number> = { allow: 0, masked: 1, deny: 2 };
const COPY = TH.admin.auditTab;

export type AuditFilterParams = AuditFilter;

type View = { filter: AuditFilter; range: AuditRange; limit: number };

type TurnGroup = { key: string; entries: AuditEntry[] };

function hrefWith(view: View, change: Partial<{ decision: AuditEntry["decision"] | null; limit: number }>): string {
  const params = new URLSearchParams({ tab: "audit", range: view.range });
  const decision = change.decision === undefined ? view.filter.decision : change.decision;
  if (view.filter.userId) params.set("user", view.filter.userId);
  if (view.filter.tool) params.set("tool", view.filter.tool);
  if (view.filter.connector) params.set("connector", view.filter.connector);
  if (decision) params.set("decision", decision);
  if (change.limit) params.set("limit", String(change.limit));
  return `/admin?${params.toString()}`;
}

function groupsOf(entries: AuditEntry[]): TurnGroup[] {
  const groups: TurnGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    const key = entry.turnId ?? entry.id;
    if (last && entry.turnId && last.key === key) last.entries.push(entry);
    else groups.push({ key, entries: [entry] });
  }
  return groups;
}

function worstOf(entries: AuditEntry[]): AuditEntry["decision"] {
  return entries.reduce<AuditEntry["decision"]>((worst, entry) => (DECISION_WEIGHT[entry.decision] > DECISION_WEIGHT[worst] ? entry.decision : worst), "allow");
}

function reasonOf(entry: AuditEntry): string | null {
  if (entry.tool === GUARD_AUDIT_TOOL) return entry.reason ?? null;
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

function Filters({ view }: { view: View }) {
  const { filter } = view;
  const filtered = filter.userId || filter.tool || filter.connector || filter.decision || view.range !== "7d";
  return (
    <AutoSubmitForm action="/admin" className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="tab" value="audit" />
      {filter.decision ? <input type="hidden" name="decision" value={filter.decision} /> : null}
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
      {reason ? <p className="text-[12px] text-foreground/80">{entry.reason ? `${reason} — ${entry.reason}` : reason}</p> : null}
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
  const viaMcp = first.initiator === "mcp";
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
            {viaMcp ? <Pill tone="primary">{COPY.viaMcp}</Pill> : null}
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

export function AuditTab({ filter, range, limit, openRun }: { filter: AuditFilter; range: AuditRange; limit: number; openRun: string | null }) {
  const view: View = { filter, range, limit };
  const scoped = auditLog().all().filter((entry) => inAuditScope(entry, filter));
  const counts = { all: scoped.length, allow: 0, deny: 0, masked: 0 };
  for (const entry of scoped) counts[entry.decision] += 1;
  const total = counts[filter.decision ?? "all"];
  const entries = auditEntries(filter, limit);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DecisionChips view={view} counts={counts} />
        <Filters view={view} />
      </div>

      <Panel title={COPY.title} hint={`${COPY.hint} · ${TH.admin.filters.count(entries.length, total)}`} bodyClassName="px-2 pb-2 pt-3">
        {entries.length === 0 ? (
          <div className="px-3 pb-3">
            <EmptyLine text={COPY.empty} />
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {groupsOf(entries).map((group) => (
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
