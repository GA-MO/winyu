import Link from "next/link";
import { cn } from "vexa/lib/utils";
import type { AuditEntry } from "@/lib/contracts";
import { toolLabel, toolSurface } from "@/lib/server/tools/registry";
import { USERS, findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { auditEntries } from "@/lib/server/usage";
import { auditLog } from "@/lib/server/audit";
import { Avatar, EmptyLine, FOCUS, GHOST, INK, Panel, Pill, Select, stamp, type Tone } from "./parts";

const AUDIT_LIMIT = 60;
const DECISIONS: readonly AuditEntry["decision"][] = ["allow", "deny", "masked"];
const DECISION_TONE: Record<AuditEntry["decision"], Tone> = { allow: "success", deny: "danger", masked: "warning" };
const COPY = TH.admin.auditTab;

export type AuditFilterParams = { userId: string | null; tool: string | null; decision: AuditEntry["decision"] | null };

function hrefWith(filter: AuditFilterParams, decision: AuditEntry["decision"] | null): string {
  const params = new URLSearchParams({ tab: "audit" });
  if (filter.userId) params.set("user", filter.userId);
  if (filter.tool) params.set("tool", filter.tool);
  if (decision) params.set("decision", decision);
  return `/admin?${params.toString()}`;
}

function DecisionChips({ filter, counts }: { filter: AuditFilterParams; counts: Record<AuditEntry["decision"], number> & { all: number } }) {
  const items: { key: AuditEntry["decision"] | null; label: string; count: number }[] = [
    { key: null, label: TH.admin.filters.all, count: counts.all },
    ...DECISIONS.map((decision) => ({ key: decision, label: TH.admin.decision[decision], count: counts[decision] })),
  ];
  return (
    <div className="flex flex-wrap gap-0.5 rounded-3xl bg-muted p-1">
      {items.map((item) => (
        <Link
          key={item.label}
          href={hrefWith(filter, item.key)}
          className={cn(
            "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium transition",
            FOCUS,
            filter.decision === item.key ? "bg-card text-foreground shadow-card" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
          <span className="tabular-nums text-muted-foreground">{item.count.toLocaleString("th-TH")}</span>
        </Link>
      ))}
    </div>
  );
}

export function AuditTab({ filter }: { filter: AuditFilterParams }) {
  const all = auditLog().all();
  const scoped = all.filter((entry) => (!filter.userId || entry.userId === filter.userId) && (!filter.tool || entry.tool === filter.tool));
  const counts = { all: scoped.length, allow: 0, deny: 0, masked: 0 };
  for (const entry of scoped) counts[entry.decision] += 1;
  const entries = auditEntries(filter, AUDIT_LIMIT);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <DecisionChips filter={filter} counts={counts} />
        <form className="flex flex-wrap items-center gap-2" action="/admin">
          <input type="hidden" name="tab" value="audit" />
          {filter.decision ? <input type="hidden" name="decision" value={filter.decision} /> : null}
          <Select name="user" defaultValue={filter.userId ?? ""} aria-label={TH.admin.filters.user}>
            <option value="">{`${TH.admin.filters.user}: ${TH.admin.filters.all}`}</option>
            {USERS.map((person) => (
              <option key={person.id} value={person.id}>
                {person.nameTh}
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
          <button type="submit" className={INK}>
            {TH.admin.filters.apply}
          </button>
          {filter.userId || filter.tool || filter.decision ? (
            <Link href="/admin?tab=audit" className={GHOST}>
              {TH.admin.filters.clear}
            </Link>
          ) : null}
        </form>
      </div>

      <Panel title={COPY.title} hint={`${COPY.hint} · ${TH.admin.filters.count(entries.length, counts[filter.decision ?? "all"])}`} bodyClassName="px-2 pb-2 pt-3">
        {entries.length === 0 ? (
          <div className="px-3 pb-3">
            <EmptyLine text={COPY.empty} />
          </div>
        ) : (
          <ul className="flex flex-col">
            {entries.map((entry) => {
              const person = findUser(entry.userId);
              return (
                <li key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl px-3 py-2.5 transition hover:bg-muted/60 sm:grid-cols-[auto_minmax(0,1fr)_13rem_5rem_5.5rem]">
                  <Avatar name={person?.nameTh ?? entry.userId} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{person?.nameTh ?? entry.userId}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {person ? TH.role[person.role] : ""} · {stamp(entry.at)}
                    </p>
                  </div>
                  <div className="hidden min-w-0 sm:block">
                    <p className="truncate text-sm">{toolLabel(entry.tool)}</p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{entry.tool}</p>
                  </div>
                  <div className="hidden text-right text-[11px] tabular-nums text-muted-foreground sm:block">
                    <p>{COPY.rows(entry.rowsReturned)}</p>
                    <p>{COPY.latency(entry.latencyMs)}</p>
                  </div>
                  <span className="justify-self-end">
                    <Pill tone={DECISION_TONE[entry.decision]}>{TH.admin.decision[entry.decision]}</Pill>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
