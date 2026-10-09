"use client";

import { AlertTriangle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { EmptyLine, FIELD, FOCUS, Panel, Pill } from "@/components/admin/parts";
import type { ToolTier } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { MAX_DESCRIPTION_CHARS, toolBlockers, type DiscoveredTool, type RemoteHints, type ToolDraft } from "./model";
import { Check, FencedText, hasSuspiciousText, Label, Segmented } from "./parts";
import type { ToolPatch, WizardData } from "./wizard";

const COPY = TH.connectorUi.tools;
const TIERS: readonly { id: ToolTier; label: string }[] = [
  { id: "read", label: TH.admin.tier.read },
  { id: "write", label: TH.admin.tier.write },
  { id: "destructive", label: TH.admin.tier.destructive },
];

function HintPills({ hints }: { hints: RemoteHints }) {
  return (
    <span className="flex flex-wrap gap-1">
      {hints.readOnly === true ? <Pill>{COPY.hints.readOnly}</Pill> : null}
      {hints.readOnly === false && hints.destructive !== true ? <Pill tone="primary">{COPY.hints.writes}</Pill> : null}
      {hints.destructive === true ? <Pill tone="warning">{COPY.hints.destructive}</Pill> : null}
      {hints.idempotent === true && hints.readOnly === false ? <Pill tone="success">{COPY.hints.idempotent}</Pill> : null}
    </span>
  );
}

function ToolCard({ tool, remote, patch }: { tool: ToolDraft; remote: DiscoveredTool; patch: (next: ToolPatch) => void }) {
  const lies = toolBlockers(tool, remote).includes("remote_says_writes");
  return (
    <li className={cn("rounded-3xl border bg-card p-4 transition", tool.include ? "border-foreground/25 shadow-card" : "border-border")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Check checked={tool.include} onChange={(include) => patch((current) => ({ ...current, include }))}>
          <span className="font-mono text-[13px] font-medium">{remote.name}</span>
        </Check>
        <HintPills hints={remote.hints} />
      </div>
      <div className="mt-3 flex flex-col gap-3">
        <FencedText text={remote.description} />
        {hasSuspiciousText(remote.description) ? (
          <p className="flex items-start gap-2 text-[12px] text-danger">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            {COPY.suspicious}
          </p>
        ) : null}
        <p className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
          <span>{COPY.inputs}</span>
          {remote.inputs.map((input) => (
            <code key={input.name} className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground/80" title={input.type}>
              {input.name}
            </code>
          ))}
        </p>
      </div>
      {tool.include ? (
        <div className="mt-4 grid gap-4 border-t border-border pt-4 md:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <Label>{COPY.labelTh}</Label>
            <input className={FIELD} value={tool.labelTh} placeholder={COPY.labelPlaceholder} onChange={(event) => patch((current) => ({ ...current, labelTh: event.target.value }))} />
          </label>
          <div className="flex flex-col gap-1.5">
            <Label hint={COPY.tierHint}>{COPY.tier}</Label>
            <Segmented value={tool.tier} options={TIERS} label={COPY.tier} onChange={(tier) => patch((current) => ({ ...current, tier }))} />
            {lies ? <p className="text-[12px] text-danger">{TH.connectorUi.review.blockers.remote_says_writes}</p> : <p className="text-[11px] text-muted-foreground">{COPY.hintRule}</p>}
          </div>
          <label className="flex flex-col gap-1.5 md:col-span-2">
            <Label>{COPY.approved}</Label>
            <textarea
              rows={3}
              value={tool.description}
              onChange={(event) => patch((current) => ({ ...current, description: event.target.value }))}
              className={cn("rounded-2xl border border-border bg-card px-3.5 py-2.5 text-[13px] leading-relaxed shadow-card", FOCUS)}
            />
            <span className={cn("px-1 text-[11px]", tool.description.length > MAX_DESCRIPTION_CHARS ? "text-danger" : "text-muted-foreground")}>{COPY.approvedHint(tool.description.length, MAX_DESCRIPTION_CHARS)}</span>
          </label>
        </div>
      ) : null}
    </li>
  );
}

export function ToolsStep({ data, patchTool }: { data: WizardData; patchTool: (name: string, patch: ToolPatch) => void }) {
  return (
    <Panel title={TH.connectorUi.steps.tools} hint={COPY.hint}>
      {data.tools.length === 0 ? (
        <EmptyLine text={COPY.none} />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.tools.map((tool) => {
            const remote = data.remote.find((item) => item.name === tool.name);
            return remote ? <ToolCard key={tool.name} tool={tool} remote={remote} patch={(patch) => patchTool(tool.name, patch)} /> : null;
          })}
        </ul>
      )}
    </Panel>
  );
}
