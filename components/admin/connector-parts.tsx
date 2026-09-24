import Link from "next/link";
import { cn } from "vexa/lib/utils";
import type { ConnectorDef } from "@/lib/contracts";
import { connectorEnabled, connectorSwitchId, switchEntry } from "@/lib/access/enforce";
import { connectorHealth } from "@/lib/server/connectors/catalog";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { setConnectorAction } from "@/app/(app)/admin/actions";
import { Pill, SystemToggle, stamp, type Tone } from "./parts";

const COPY = TH.admin.connectors;

type Health = keyof typeof COPY.health;

const HEALTH_TONE: Record<Health, Tone> = { native: "neutral", online: "success", offline: "danger", unknown: "neutral" };

function healthOf(connector: ConnectorDef): Health {
  return connector.kind === "native" ? "native" : connectorHealth(connector.id);
}

function changedLine(connector: ConnectorDef): string | null {
  const entry = switchEntry(connectorSwitchId(connector.id));
  return entry ? COPY.changed(findUser(entry.by)?.nameTh ?? entry.by, stamp(entry.at)) : null;
}

/** One connector as a group header: its name, the system behind it, whether Cop reaches it, and the switch that closes all of its tools. */
export function ConnectorHeader({ connector }: { connector: ConnectorDef }) {
  const enabled = connectorEnabled(connector.id);
  const health = healthOf(connector);
  const changed = changedLine(connector);
  return (
    <form action={setConnectorAction} className="flex items-center gap-3">
      <input type="hidden" name="connector" value={connector.id} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={cn("text-sm font-semibold", enabled ? "" : "text-muted-foreground line-through")}>{connector.labelTh}</span>
          {health === "native" ? null : <Pill tone={HEALTH_TONE[health]}>{COPY.health[health]}</Pill>}
          {enabled ? null : <Pill tone="danger">{COPY.off}</Pill>}
        </p>
        <p className="truncate text-[11px] font-normal text-muted-foreground" title={changed ?? undefined}>
          {enabled ? connector.sourceSystemTh : COPY.closedHint}
        </p>
      </div>
      <SystemToggle on={enabled} onLabel={COPY.shutAll} offLabel={COPY.reopen} />
    </form>
  );
}

/** A connector as a heading inside one role's view: name, status and whether it is closed for everyone, with no switch, since that switch acts on every role. */
export function ConnectorTitle({ connector }: { connector: ConnectorDef }) {
  const enabled = connectorEnabled(connector.id);
  const health = healthOf(connector);
  return (
    <div className="min-w-0">
      <p className="flex flex-wrap items-center gap-1.5">
        <span className={cn("text-[12px] font-semibold", enabled ? "" : "text-muted-foreground line-through")}>{connector.labelTh}</span>
        {health === "native" ? null : <Pill tone={HEALTH_TONE[health]}>{COPY.health[health]}</Pill>}
        {enabled ? null : (
          <Link href="/admin?tab=tools" className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <Pill tone="danger">{TH.admin.access.systemOff}</Pill>
          </Link>
        )}
      </p>
      <p className="truncate text-[11px] font-normal text-muted-foreground">{connector.sourceSystemTh}</p>
    </div>
  );
}
