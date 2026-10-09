import Link from "next/link";
import { Plug, RefreshCw } from "lucide-react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { RESERVED_REASONS, type BlockerCode, type ConnectorView, type LifecycleState } from "@/lib/connectors/spec";
import { connectorViews, serverSettings } from "@/lib/server/connectors/admin";
import { checkConnectorUpstreamAction } from "@/app/(app)/admin/actions";
import { EmptyLine, GHOST, INK, Panel, Pill, stamp, type Tone } from "./parts";

const COPY = TH.connectorUi;
const STATE_TONE: Record<LifecycleState, Tone> = { draft: "neutral", ready: "primary", live: "success", disabled: "danger", drifted: "warning" };
const TOOL_BLOCKERS = ["changed_upstream", "gone_upstream", "stale_test", "no_test"] as const satisfies readonly BlockerCode[];

type ToolState = keyof typeof COPY.list.toolState;

const TOOL_TONE: Record<ToolState, Tone> = { live: "success", waiting: "primary", off: "danger", no_test: "neutral", stale_test: "warning", changed_upstream: "warning", gone_upstream: "danger", duplicate: "danger" };

function toolStateOf(view: ConnectorView, name: string): ToolState {
  if (view.blockers[name]?.some((code) => RESERVED_REASONS.includes(code))) return "duplicate";
  const blocker = TOOL_BLOCKERS.find((code) => view.blockers[name]?.includes(code));
  if (blocker) return blocker;
  if (view.connector.activatedAt === null) return "waiting";
  return view.enabled ? "live" : "off";
}

function ConnectorRow({ view }: { view: ConnectorView }) {
  const connector = view.connector;
  return (
    <li className="flex flex-col gap-2.5 border-t border-border py-3.5 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5">
            <span className="text-sm font-semibold">{connector.labelTh}</span>
            <Pill tone={STATE_TONE[view.state]} title={COPY.stateBody[view.state]}>
              {COPY.states[view.state]}
            </Pill>
          </p>
          <p className="truncate font-mono text-[11px] text-muted-foreground">{connector.url}</p>
          {view.upstream ? <p className="text-[11px] text-muted-foreground">{COPY.list.checked(stamp(view.upstream.at))}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {connector.activatedAt ? (
            <form action={checkConnectorUpstreamAction}>
              <input type="hidden" name="connector" value={connector.id} />
              <button type="submit" className={GHOST}>
                <RefreshCw className="size-3.5" aria-hidden />
                {COPY.list.check}
              </button>
            </form>
          ) : null}
          <Link href={`/admin/connect?id=${encodeURIComponent(connector.id)}`} className={GHOST}>
            {COPY.list.edit}
          </Link>
        </div>
      </div>
      {Object.keys(connector.tools).length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {Object.entries(connector.tools).map(([name, tool]) => {
            const state = toolStateOf(view, name);
            return (
              <li key={name} className="flex items-center gap-1.5 rounded-full border border-border bg-muted/30 py-0.5 pl-2.5 pr-1 text-[12px]">
                <span title={name}>{tool.labelTh}</span>
                <Pill tone={TOOL_TONE[state]}>{COPY.list.toolState[state]}</Pill>
              </li>
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

/** The connectors IT added in the console, with their lifecycle and each tool's state, and the way to add another. */
export function ConsoleConnectors({ viewer }: { viewer: User | null }) {
  const settings = serverSettings(viewer);
  if (!settings) return null;
  const views = connectorViews(viewer);
  const add = (
    <Link href="/admin/connect" className={INK}>
      <Plug className="size-4" aria-hidden />
      {COPY.list.add}
    </Link>
  );
  return (
    <Panel title={COPY.list.title} hint={COPY.list.hint} action={add}>
      {settings.writable ? null : <p className="mb-3 rounded-2xl bg-warning/10 px-3.5 py-2.5 text-[12px]">{COPY.readOnly}</p>}
      {views.length === 0 ? (
        <EmptyLine text={COPY.list.empty} />
      ) : (
        <ul className="flex flex-col">
          {views.map((view) => (
            <ConnectorRow key={view.connector.id} view={view} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
