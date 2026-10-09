import Link from "next/link";
import { cn } from "@/components/ui/cn";
import { ROLE_IDS, type RoleId, type ToolSurfaceEntry, type ToolTier, type User } from "@/lib/contracts";
import { surfaceByConnector } from "@/lib/server/tools/registry";
import { closureOf, killedTools } from "@/lib/access/enforce";
import { permissionsFor } from "@/lib/access/role-overrides";
import { sinceOf, toolActivity, type ToolActivity } from "@/lib/server/usage";
import { TH } from "@/lib/i18n/th";
import { setToolKilledAction } from "@/app/(app)/admin/actions";
import { ConnectorHeader } from "./connector-parts";
import { ConsoleConnectors } from "./console-connectors";
import { HandoffSwitchRow } from "./overview-tab";
import { FOCUS, Panel, Pill, SwitchButton, type Tone } from "./parts";

const COPY = TH.admin.toolsTab;
const TIER_TONE: Record<ToolTier, Tone> = { read: "neutral", write: "primary", destructive: "warning" };
const NO_ACTIVITY: ToolActivity = { calls: 0, failed: 0 };
const COLUMN_COUNT = 6;

function systemClosure(entry: ToolSurfaceEntry) {
  const closure = closureOf(entry.name);
  return closure === "killed" ? null : closure;
}

function KillControl({ entry, isKilled }: { entry: ToolSurfaceEntry; isKilled: boolean }) {
  return (
    <form action={setToolKilledAction} className="flex items-center justify-end gap-2">
      <input type="hidden" name="tool" value={entry.name} />
      <input type="hidden" name="killed" value={String(!isKilled)} />
      <SwitchButton on={!isKilled} label={`${entry.labelTh}: ${isKilled ? COPY.killed : COPY.live}`} />
    </form>
  );
}

function ToolRow({ entry, isKilled, roles, activity }: { entry: ToolSurfaceEntry; isKilled: boolean; roles: RoleId[]; activity: ToolActivity }) {
  const closure = systemClosure(entry);
  return (
    <tr className="border-t border-border align-top">
      <td className="py-3 pl-4 pr-3">
        <p className={cn("text-sm font-medium", isKilled || closure ? "text-muted-foreground" : "", isKilled ? "line-through" : "")} title={entry.name}>
          {entry.labelTh}
        </p>
        <p className="mt-0.5 max-w-md text-[12px] leading-relaxed text-muted-foreground">{entry.bodyTh}</p>
        {closure ? (
          <p className="mt-1">
            <Pill tone="danger">{TH.admin.access.closure[closure]}</Pill>
          </p>
        ) : null}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-col items-start gap-1">
          <Pill tone={TIER_TONE[entry.tier]}>{TH.admin.tier[entry.tier]}</Pill>
          {entry.tier !== "read" ? <span className="text-[11px] text-muted-foreground">{COPY.approval}</span> : null}
        </div>
      </td>
      <td className="px-3 py-3 text-sm tabular-nums">
        <Link href="/admin?tab=access&view=matrix" title={roles.map((role) => TH.role[role]).join(", ")} className={cn("rounded underline-offset-2 hover:underline", FOCUS)}>
          {COPY.roles(roles.length, ROLE_IDS.length)}
        </Link>
      </td>
      <td className="px-3 py-3 text-right text-sm tabular-nums">{activity.calls.toLocaleString("th-TH")}</td>
      <td className={cn("px-3 py-3 text-right text-sm tabular-nums", activity.failed > 0 ? "text-danger" : "text-muted-foreground")}>
        {activity.failed > 0 ? (
          <Link href={`/admin?tab=audit&tool=${encodeURIComponent(entry.name)}&decision=deny`} className={cn("rounded underline-offset-2 hover:underline", FOCUS)}>
            {activity.failed.toLocaleString("th-TH")}
          </Link>
        ) : (
          "0"
        )}
      </td>
      <td className="py-3 pl-3 pr-4">
        <KillControl entry={entry} isKilled={isKilled} />
      </td>
    </tr>
  );
}

export function ToolsTab({ viewer }: { viewer: User | null }) {
  const killed = new Set(killedTools());
  const allowedBy = ROLE_IDS.map((role) => ({ role, tools: new Set(permissionsFor(role).toolAllow) }));
  const rolesOf = (name: ToolSurfaceEntry["name"]) => allowedBy.filter((item) => item.tools.has(name)).map((item) => item.role);
  const activity = toolActivity(sinceOf("7d"));
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <HandoffSwitchRow />
      </Panel>

      <ConsoleConnectors viewer={viewer} />

      <Panel title={COPY.title} hint={COPY.hint} bodyClassName="overflow-x-auto pb-2">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-medium text-muted-foreground">
              <th className="py-2 pl-4 pr-3 font-medium">{COPY.columns.tool}</th>
              <th className="px-3 py-2 font-medium">{COPY.columns.kind}</th>
              <th className="px-3 py-2 font-medium">{COPY.columns.roles}</th>
              <th className="px-3 py-2 text-right font-medium">{COPY.columns.calls}</th>
              <th className="px-3 py-2 text-right font-medium">{COPY.columns.failed}</th>
              <th className="py-2 pl-3 pr-4" aria-label={COPY.columns.status} />
            </tr>
          </thead>
          {surfaceByConnector().map((group) => (
            <tbody key={group.connector.id}>
              <tr className="border-t border-border bg-muted/50">
                <td colSpan={COLUMN_COUNT} className="px-4 py-2.5">
                  <ConnectorHeader connector={group.connector} />
                </td>
              </tr>
              {group.tools.map((entry) => (
                <ToolRow key={entry.name} entry={entry} isKilled={killed.has(entry.name)} roles={rolesOf(entry.name)} activity={activity.get(entry.name) ?? NO_ACTIVITY} />
              ))}
            </tbody>
          ))}
        </table>
      </Panel>
    </div>
  );
}
