"use client";

import { useState, useTransition } from "react";
import { Check as CheckIcon, Lock, Save } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FOCUS, GHOST, INK } from "@/components/admin/parts";
import { TH } from "@/lib/i18n/th";
import { saveConnectorToolsAction } from "@/app/(app)/admin/actions";
import type { BlockerCode, ConnectorView, Problem, ToolDraft } from "@/lib/connectors/spec";
import { refreshedTools, wizardToolsOf, type WizardTool } from "./model";
import { ConnectStep } from "./step-connect";
import { ToolsStep } from "./step-tools";
import { RolesStep } from "./step-roles";
import { ScopeStep } from "./step-scope";
import { ReviewStep } from "./step-review";
import { ProblemLine, type Person } from "./parts";
import type { CheckOptions } from "./props";

const COPY = TH.connectorUi;
const STEPS = ["connect", "tools", "roles", "scope", "review"] as const;

type StepId = (typeof STEPS)[number];

export type Settings = { hosts: string[]; writable: boolean };

export type DraftPatch = (draft: ToolDraft) => ToolDraft;

/** What the steps share: the server's view, the tools as edited, and the ways to change them. */
export type WizardContext = {
  view: ConnectorView;
  tools: WizardTool[];
  writable: boolean;
  people: Person[];
  checks: CheckOptions;
  patchDraft: (name: string, patch: DraftPatch) => void;
  setInclude: (name: string, include: boolean) => void;
  addFields: (name: string, fields: string[]) => void;
  saveTools: (names: readonly string[]) => Promise<SaveOutcome>;
  adopt: (view: ConnectorView) => void;
};

export type SaveOutcome = { ok: true; incomplete: Record<string, BlockerCode[]> } | Problem;

function Stepper({ step, reachable, onPick }: { step: StepId; reachable: boolean; onPick: (step: StepId) => void }) {
  const current = STEPS.indexOf(step);
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={COPY.title}>
      {STEPS.map((id, index) => {
        const done = index < current;
        const active = index === current;
        const disabled = !reachable && id !== "connect";
        return (
          <li key={id} className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-40",
                FOCUS,
                active ? "border-transparent bg-ink text-ink-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", active ? "bg-ink-foreground/15" : done ? "bg-success/15 text-success" : "bg-muted")}>
                {done ? <CheckIcon className="size-3" aria-hidden /> : index + 1}
              </span>
              {COPY.steps[id]}
            </button>
            {index < STEPS.length - 1 ? <span className="h-px w-3 bg-border" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

function toolSave(tool: WizardTool) {
  return { draft: tool.draft, fields: tool.fields, seenHash: tool.listed?.hash ?? "" };
}

/** The connect-a-system flow for IT admins: every step goes to the server, which validates again, seals the secret and audits; the page only ever holds the secret's last characters. */
export function ConnectorWizard({ initial, settings, people, checks }: { initial: ConnectorView | null; settings: Settings; people: Person[]; checks: CheckOptions }) {
  const [step, setStep] = useState<StepId>(initial ? "tools" : "connect");
  const [view, setView] = useState<ConnectorView | null>(initial);
  const [tools, setTools] = useState<WizardTool[]>(() => (initial ? wizardToolsOf(initial) : []));
  const [notice, setNotice] = useState<{ saved: boolean; incomplete: number; problem: Problem | null } | null>(null);
  const [saving, startSaving] = useTransition();
  const index = STEPS.indexOf(step);

  const adopt = (next: ConnectorView) => {
    setView(next);
    setTools((current) => (current.length === 0 || current.every((tool) => tool.listed === null) ? wizardToolsOf(next) : refreshedTools(current, next)));
  };

  const update = (name: string, change: (tool: WizardTool) => WizardTool) => setTools((current) => current.map((tool) => (tool.name === name ? change(tool) : tool)));

  const saveTools = async (names: readonly string[]): Promise<SaveOutcome> => {
    if (!view) return { ok: false, problem: "not_found" };
    const chosen = tools.filter((tool) => names.includes(tool.name));
    const result = await saveConnectorToolsAction({
      connector: view.connector.id,
      tools: chosen.filter((tool) => tool.include && tool.listed).map(toolSave),
      removed: chosen.filter((tool) => !tool.include && tool.stored).map((tool) => tool.name),
    });
    if (!result.ok) return result;
    adopt(result.view);
    return { ok: true, incomplete: result.incomplete };
  };

  const saveAll = () =>
    startSaving(async () => {
      const outcome = await saveTools(tools.map((tool) => tool.name));
      setNotice(outcome.ok ? { saved: true, incomplete: Object.keys(outcome.incomplete).length, problem: null } : { saved: false, incomplete: 0, problem: outcome });
    });

  const context: WizardContext | null = view
    ? {
        view,
        tools,
        writable: settings.writable,
        people,
        checks,
        patchDraft: (name, patch) => update(name, (tool) => ({ ...tool, draft: patch(tool.draft) })),
        setInclude: (name, include) => update(name, (tool) => ({ ...tool, include })),
        addFields: (name, fields) => update(name, (tool) => ({ ...tool, fields: [...new Set([...tool.fields, ...fields])] })),
        saveTools,
        adopt,
      }
    : null;

  return (
    <div className="flex flex-col gap-5">
      {settings.writable ? null : (
        <p role="status" className="flex items-start gap-2 rounded-2xl bg-warning/10 px-4 py-3 text-[13px]">
          <Lock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          {COPY.readOnly}
        </p>
      )}
      <Stepper step={step} reachable={context !== null} onPick={setStep} />
      {step === "connect" ? <ConnectStep view={view} settings={settings} onConnected={(next) => {
        adopt(next);
        setStep("tools");
      }} /> : null}
      {context && step === "tools" ? <ToolsStep context={context} /> : null}
      {context && step === "roles" ? <RolesStep context={context} /> : null}
      {context && step === "scope" ? <ScopeStep context={context} /> : null}
      {context && step === "review" ? <ReviewStep context={context} /> : null}
      {notice?.problem ? <ProblemLine text={COPY.problems[notice.problem.problem]} detail={notice.problem.detail} /> : null}
      <nav className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" className={cn(GHOST, index === 0 ? "invisible" : "")} onClick={() => setStep(STEPS[index - 1] ?? "connect")}>
          {COPY.previous}
        </button>
        <div className="flex flex-wrap items-center gap-3">
          {notice?.saved ? (
            <span role="status" className={cn("text-[12px]", notice.incomplete > 0 ? "text-warning" : "text-success")}>
              {notice.incomplete > 0 ? COPY.incomplete(notice.incomplete) : COPY.saved}
            </span>
          ) : null}
          {context && step !== "connect" ? (
            <button type="button" className={GHOST} onClick={saveAll} disabled={saving || !settings.writable}>
              <Save className="size-4" aria-hidden />
              {saving ? COPY.saving : COPY.save}
            </button>
          ) : null}
          {index < STEPS.length - 1 && context ? (
            <button type="button" className={INK} onClick={() => setStep(STEPS[index + 1] ?? "review")}>
              {COPY.next}
            </button>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
