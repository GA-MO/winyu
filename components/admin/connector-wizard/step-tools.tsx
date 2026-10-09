"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { EmptyLine, FIELD, FOCUS, Panel, Pill } from "@/components/admin/parts";
import type { ToolTier } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { hasSuspiciousText, inputNamesOf, MAX_DESCRIPTION_CHARS, type RemoteHints } from "@/lib/connectors/spec";
import { withTier, writesUpstream, type WizardTool } from "./model";
import { Check, FencedText, Label, Segmented } from "./parts";
import type { WizardContext } from "./wizard";

const COPY = TH.connectorUi.tools;
const TIERS: readonly { id: ToolTier; label: string }[] = [
  { id: "read", label: TH.admin.tier.read },
  { id: "write", label: TH.admin.tier.write },
  { id: "destructive", label: TH.admin.tier.destructive },
];

function HintPills({ hints }: { hints: RemoteHints }) {
  if (hints.destructive === true) return <Pill tone="warning">{COPY.hints.destructive}</Pill>;
  if (hints.readOnly === false) return <Pill tone="primary">{COPY.hints.writes}</Pill>;
  if (hints.readOnly === true) return <Pill>{COPY.hints.readOnly}</Pill>;
  return <Pill>{COPY.hints.unknown}</Pill>;
}

function Changed({ tool }: { tool: WizardTool }) {
  if (!tool.stored || !tool.listed || tool.stored.pinned.hash === tool.listed.hash) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-warning/40 bg-warning/10 p-3">
      <p className="flex items-center gap-2 text-[13px] font-medium">
        <AlertTriangle className="size-4 text-warning" aria-hidden />
        {COPY.changed}
      </p>
      <p className="text-[12px] text-muted-foreground">{COPY.changedHint}</p>
      <div className="grid gap-2 md:grid-cols-2">
        {[
          { caption: COPY.before, description: tool.stored.pinned.description, schema: tool.stored.pinned.inputSchema },
          { caption: COPY.now, description: tool.listed.description, schema: tool.listed.inputSchema },
        ].map((side) => (
          <div key={side.caption} className="flex flex-col gap-1.5">
            <FencedText text={side.description} caption={side.caption} />
            <p className="px-1 font-mono text-[11px] text-muted-foreground">{`${COPY.inputs}: ${inputNamesOf(side.schema).join(", ")}`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Declaration({ tool, context }: { tool: WizardTool; context: WizardContext }) {
  const patch = context.patchDraft.bind(null, tool.name);
  const draft = tool.draft;
  return (
    <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
      <label className="flex flex-col gap-1.5">
        <Label>{COPY.labelTh}</Label>
        <input className={FIELD} value={draft.labelTh} placeholder={COPY.labelPlaceholder} onChange={(event) => patch((current) => ({ ...current, labelTh: event.target.value }))} />
      </label>
      <div className="flex flex-col gap-1.5">
        <Label hint={COPY.readHint}>{COPY.tier}</Label>
        <Segmented value={draft.tier} options={TIERS} label={COPY.tier} onChange={(tier) => patch((current) => withTier(current, tier, tool.listed))} />
      </div>
      <label className="flex flex-col gap-1.5 md:col-span-2">
        <Label>{COPY.approved}</Label>
        <textarea
          rows={3}
          value={draft.description}
          onChange={(event) => patch((current) => ({ ...current, description: event.target.value }))}
          className={cn("rounded-2xl border border-border bg-card px-3.5 py-2.5 text-[13px] leading-relaxed shadow-card", FOCUS)}
        />
        <span className={cn("px-1 text-[11px]", draft.description.length > MAX_DESCRIPTION_CHARS ? "text-danger" : "text-muted-foreground")}>{COPY.approvedHint(draft.description.length, MAX_DESCRIPTION_CHARS)}</span>
      </label>
    </div>
  );
}

function ToolCard({ tool, context }: { tool: WizardTool; context: WizardContext }) {
  const writes = writesUpstream(tool);
  const closed = tool.reserved !== null;
  const listed = tool.listed;
  return (
    <li className={cn("rounded-3xl border bg-card p-4 transition", tool.include ? "border-foreground/25 shadow-card" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Check checked={tool.include} disabled={!context.writable || (closed && !tool.include)} onChange={(include) => context.setInclude(tool.name, include)}>
          <span className="font-mono text-[13px] font-medium">{tool.name}</span>
        </Check>
        <span className="flex flex-wrap items-center gap-1">
          {listed ? <HintPills hints={listed.hints} /> : null}
          {tool.reserved ? <Pill tone="danger">{TH.connectorUi.list.toolState.duplicate}</Pill> : null}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-3">
        {listed ? <FencedText text={listed.description} /> : <p className="text-[13px] text-danger">{COPY.gone}</p>}
        {listed && hasSuspiciousText(listed.description) ? (
          <p className="flex items-start gap-2 text-[12px] text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {COPY.suspicious}
          </p>
        ) : null}
        {writes ? <p className="text-[12px] text-muted-foreground">{COPY.writeNote}</p> : null}
        {tool.reserved ? <p className="text-[12px] text-danger">{TH.connectorUi.review.blockers[tool.reserved]}</p> : null}
        {listed ? (
          <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span>{COPY.inputs}</span>
            {inputNamesOf(listed.inputSchema).map((name) => (
              <code key={name} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80">
                {name}
              </code>
            ))}
          </p>
        ) : null}
        <Changed tool={tool} />
      </div>
      {tool.include && listed ? <Declaration tool={tool} context={context} /> : null}
    </li>
  );
}

export function ToolsStep({ context }: { context: WizardContext }) {
  return (
    <Panel title={TH.connectorUi.steps.tools} hint={COPY.hint}>
      {context.tools.length === 0 ? (
        <EmptyLine text={COPY.none} />
      ) : (
        <ul className="flex flex-col gap-3">
          {context.tools.map((tool) => (
            <ToolCard key={tool.name} tool={tool} context={context} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
