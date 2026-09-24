import { cn } from "vexa/lib/utils";
import type { ConnectorDef } from "@/lib/contracts";
import { connectorEnabled, connectorSwitchId, switchEntry } from "@/lib/access/enforce";
import { connectorHealth } from "@/lib/server/connectors/catalog";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { setConnectorAction } from "@/app/(app)/admin/actions";
import { Pill, SwitchButton, stamp, type Tone } from "./parts";

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
export function ConnectorHeader({ connector, compact = false }: { connector: ConnectorDef; compact?: boolean }) {
  const enabled = connectorEnabled(connector.id);
  const health = healthOf(connector);
  const changed = changedLine(connector);
  return (
    <form action={setConnectorAction} className="flex items-center gap-3">
      <input type="hidden" name="connector" value={connector.id} />
      <input type="hidden" name="enabled" value={String(!enabled)} />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-1.5">
          <span className={cn("font-semibold", compact ? "text-[12px]" : "text-sm", enabled ? "" : "text-muted-foreground line-through")}>{connector.labelTh}</span>
          <Pill tone={HEALTH_TONE[health]}>{COPY.health[health]}</Pill>
          {enabled ? null : <Pill tone="danger">{COPY.off}</Pill>}
        </p>
        <p className="truncate text-[11px] font-normal text-muted-foreground" title={changed ?? undefined}>
          {enabled ? connector.sourceSystemTh : COPY.closedHint}
        </p>
      </div>
      <SwitchButton on={enabled} label={enabled ? COPY.turnOff(connector.labelTh) : COPY.turnOn(connector.labelTh)} />
    </form>
  );
}
