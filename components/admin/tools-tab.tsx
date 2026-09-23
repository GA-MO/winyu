import { cn } from "vexa/lib/utils";
import { ROLE_IDS, TOOL_SURFACE, type ToolTier } from "@/lib/contracts";
import { killedTools } from "@/lib/access/enforce";
import { permissionsFor } from "@/lib/access/role-overrides";
import { TH } from "@/lib/i18n/th";
import { setToolKilledAction } from "@/app/(app)/admin/actions";
import { HandoffSwitchRow } from "./overview-tab";
import { Panel, Pill, SwitchButton, type Tone } from "./parts";

const COPY = TH.admin.toolsTab;
const TIER_TONE: Record<ToolTier, Tone> = { read: "neutral", write: "primary", destructive: "warning" };

export function ToolsTab() {
  const killed = new Set(killedTools());
  const allowedBy = ROLE_IDS.map((role) => ({ role, tools: new Set(permissionsFor(role).toolAllow) }));
  return (
    <div className="flex flex-col gap-4">
      <Panel>
        <HandoffSwitchRow />
      </Panel>

      <div className="flex flex-col gap-1 px-1">
        <h2 className="text-[15px] font-semibold tracking-tight">{COPY.title}</h2>
        <p className="text-xs text-muted-foreground">{COPY.hint}</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {TOOL_SURFACE.map((entry) => {
          const isKilled = killed.has(entry.name);
          const roles = allowedBy.filter((item) => item.tools.has(entry.name)).map((item) => item.role);
          const info = TH.admin.tools[entry.name];
          return (
            <section
              key={entry.name}
              className={cn("flex min-w-0 flex-col gap-3 rounded-3xl border bg-card p-5 shadow-card transition", isKilled ? "border-danger/30" : "border-border")}
            >
              <header className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h3 className={cn("text-sm font-semibold", isKilled ? "text-muted-foreground line-through" : "")}>{info.label}</h3>
                    <Pill tone={TIER_TONE[entry.tier]}>{TH.admin.tier[entry.tier]}</Pill>
                    {entry.tier !== "read" ? <Pill>{COPY.approval}</Pill> : null}
                  </div>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">{entry.name}</p>
                </div>
                <form action={setToolKilledAction} className="flex items-center gap-2">
                  <input type="hidden" name="tool" value={entry.name} />
                  <input type="hidden" name="killed" value={String(!isKilled)} />
                  <span className={cn("text-[11px] font-medium", isKilled ? "text-danger" : "text-muted-foreground")}>{isKilled ? COPY.killed : COPY.live}</span>
                  <SwitchButton on={!isKilled} label={`${info.label}: ${isKilled ? COPY.killed : COPY.live}`} />
                </form>
              </header>
              <p className="text-sm leading-relaxed text-muted-foreground">{info.body}</p>
              <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
                <span className="mr-1 text-[11px] font-medium text-muted-foreground">{COPY.roles(roles.length, ROLE_IDS.length)}</span>
                {ROLE_IDS.map((role) => (
                  <span
                    key={role}
                    title={TH.role[role]}
                    className={cn("rounded-full px-2 py-0.5 text-[11px]", roles.includes(role) ? "bg-bubble text-accent-foreground" : "bg-muted text-muted-foreground/60 line-through")}
                  >
                    {TH.roleShort[role]}
                  </span>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
