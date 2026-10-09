"use client";

import { cn } from "@/components/ui/cn";
import { FOCUS, GHOST, Panel, Pill, type Tone } from "@/components/admin/parts";
import { ROLE_IDS, type ToolTier } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { lifecycleOf, LIFECYCLE, type Blocker, type LifecycleState, type ToolDraft } from "./model";
import { scopeCell } from "./parts";
import type { WizardData } from "./wizard";

const COPY = TH.connectorUi.card;
const TIER_TONE: Record<ToolTier, Tone> = { read: "neutral", write: "primary", destructive: "warning" };
const STATE_TONE: Record<LifecycleState, Tone> = { draft: "neutral", ready: "primary", live: "success", disabled: "danger", drifted: "warning" };

function Toggle({ on, disabled, label, onChange }: { on: boolean; disabled: boolean; label: string; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40", FOCUS, on ? "border-transparent bg-success" : "border-muted-foreground/40 bg-muted")}
    >
      <span className={cn("inline-block size-5 rounded-full shadow-card transition", on ? "translate-x-5 bg-card" : "translate-x-0.5 bg-muted-foreground")} />
    </button>
  );
}

function Lifecycle({ state }: { state: LifecycleState }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-5">
      {LIFECYCLE.map((id) => (
        <li key={id} className={cn("rounded-2xl border px-3 py-2.5", id === state ? "border-foreground/40 bg-card shadow-card" : "border-border bg-muted/30 text-muted-foreground")}>
          <p className="flex items-center gap-1.5 text-[13px] font-medium">
            <span className={cn("size-1.5 rounded-full", id === state ? "bg-foreground" : "bg-muted-foreground/40")} aria-hidden />
            {COPY.states[id]}
          </p>
          <p className="mt-1 text-[11px] leading-relaxed">{COPY.stateBody[id]}</p>
        </li>
      ))}
    </ol>
  );
}

type Props = { data: WizardData; tools: ToolDraft[]; blockers: Blocker[]; setData: React.Dispatch<React.SetStateAction<WizardData>>; onEdit: () => void };

export function CardStep({ data, tools, blockers, setData, onEdit }: Props) {
  const state = lifecycleOf(blockers, data.enabled, data.drifted !== null);
  const reachable = state === "live" || state === "drifted";
  const label = data.connector.labelTh || data.connector.id;
  const firstLive = tools[0]?.name ?? null;
  return (
    <div className="flex flex-col gap-4">
      <Panel title={COPY.title} hint={COPY.hint}>
        <Lifecycle state={state} />
      </Panel>
      <Panel bodyClassName="overflow-x-auto pb-2 px-0">
        <table className="w-full min-w-[760px] border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-medium text-muted-foreground">
              <th className="py-2 pl-4 pr-3 font-medium">{COPY.columns.tool}</th>
              <th className="px-3 py-2 font-medium">{COPY.columns.kind}</th>
              <th className="px-3 py-2 font-medium">{COPY.columns.roles}</th>
              <th className="px-3 py-2 font-medium">{COPY.columns.scope}</th>
              <th className="py-2 pl-3 pr-4" />
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border bg-muted/50">
              <td colSpan={5} className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className={cn("text-sm font-semibold", state === "disabled" ? "text-muted-foreground line-through" : "")}>{label}</span>
                      <Pill tone={data.connector.draftKey ? "success" : "neutral"}>{data.connector.draftKey ? TH.admin.connectors.health.online : TH.admin.connectors.health.unknown}</Pill>
                      <Pill tone={STATE_TONE[state]}>{COPY.states[state]}</Pill>
                    </p>
                    <p className="truncate font-mono text-[11px] text-muted-foreground">{data.connector.url}</p>
                  </div>
                  <Toggle on={reachable} disabled={state === "draft"} label={reachable ? TH.admin.connectors.shutAll : TH.admin.connectors.reopen} onChange={(on) => setData((current) => ({ ...current, enabled: on }))} />
                </div>
              </td>
            </tr>
            {tools.map((tool) => {
              const paused = data.drifted === tool.name;
              return (
                <tr key={tool.name} className="border-t border-border align-top">
                  <td className="py-3 pl-4 pr-3">
                    <p className={cn("text-sm font-medium", paused || !reachable ? "text-muted-foreground" : "")}>{tool.labelTh || tool.name}</p>
                    <p className="mt-0.5 max-w-md text-[12px] text-muted-foreground">{COPY.body(label)}</p>
                    {paused ? (
                      <p className="mt-1">
                        <Pill tone="warning">{COPY.drifted}</Pill>
                      </p>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <Pill tone={TIER_TONE[tool.tier]}>{TH.admin.tier[tool.tier]}</Pill>
                      {tool.tier !== "read" ? <span className="text-[11px] text-muted-foreground">{COPY.approval}</span> : null}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-sm tabular-nums">{COPY.rolesCount(tool.roles.length, ROLE_IDS.length)}</td>
                  <td className="px-3 py-3 text-[13px]">{scopeCell(tool.scope)}</td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <Toggle on={reachable && !paused} disabled={!reachable} label={tool.labelTh || tool.name} onChange={() => undefined} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>
      <div className="flex flex-wrap gap-2">
        {firstLive && state === "live" ? (
          <button type="button" className={GHOST} onClick={() => setData((current) => ({ ...current, drifted: firstLive }))}>
            {COPY.simulateDrift}
          </button>
        ) : null}
        {state === "drifted" ? (
          <button type="button" className={GHOST} onClick={() => setData((current) => ({ ...current, drifted: null }))}>
            {COPY.resetDrift}
          </button>
        ) : null}
        <button type="button" className={GHOST} onClick={onEdit}>
          {COPY.edit}
        </button>
      </div>
    </div>
  );
}
