"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FOCUS, GHOST, INK } from "@/components/admin/parts";
import { TH } from "@/lib/i18n/th";
import { blockersOf, type ConnectorDraft, type DiscoveredTool, type ToolDraft } from "./model";
import { ConnectStep, type Example } from "./step-connect";
import { ToolsStep } from "./step-tools";
import { RolesStep } from "./step-roles";
import { ScopeStep } from "./step-scope";
import { ReviewStep } from "./step-review";
import { CardStep } from "./step-card";
import type { Person } from "./parts";

const COPY = TH.connectorUi;
const STEPS = ["connect", "tools", "roles", "scope", "review", "card"] as const;

type StepId = (typeof STEPS)[number];

export type WizardData = {
  connector: ConnectorDraft;
  remote: DiscoveredTool[];
  tools: ToolDraft[];
  enabled: boolean | null;
  drifted: string | null;
};

export type ToolPatch = (tool: ToolDraft) => ToolDraft;

const EMPTY: WizardData = {
  connector: { id: "", labelTh: "", url: "", auth: "signed_identity", secretHint: null, draftKey: null, fixture: false },
  remote: [],
  tools: [],
  enabled: null,
  drifted: null,
};

function Stepper({ step, onPick }: { step: StepId; onPick: (step: StepId) => void }) {
  const current = STEPS.indexOf(step);
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label={COPY.title}>
      {STEPS.map((id, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={id} className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => onPick(id)}
              aria-current={active ? "step" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm transition",
                FOCUS,
                active ? "border-transparent bg-ink text-ink-foreground" : "border-border bg-card text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("inline-flex size-5 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums", active ? "bg-ink-foreground/15" : done ? "bg-success/15 text-success" : "bg-muted")}>
                {done ? <Check className="size-3" aria-hidden /> : index + 1}
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

/** The whole connect-a-system flow in one client state: nothing is saved; discovery and test runs go to the server, the secret never comes back. */
export function Wizard({ people, examples }: { people: Person[]; examples: Example[] }) {
  const [step, setStep] = useState<StepId>("connect");
  const [data, setData] = useState<WizardData>(EMPTY);
  const index = STEPS.indexOf(step);
  const included = data.tools.filter((tool) => tool.include);
  const blockers = blockersOf(data.tools, data.remote);

  const patchTool = (name: string, patch: ToolPatch) =>
    setData((current) => ({ ...current, enabled: null, tools: current.tools.map((tool) => (tool.name === name ? patch(tool) : tool)) }));

  return (
    <div className="flex flex-col gap-5">
      <Stepper step={step} onPick={setStep} />
      {step === "connect" ? <ConnectStep data={data} setData={setData} examples={examples} onDone={() => setStep("tools")} /> : null}
      {step === "tools" ? <ToolsStep data={data} patchTool={patchTool} /> : null}
      {step === "roles" ? <RolesStep tools={included} patchTool={patchTool} /> : null}
      {step === "scope" ? <ScopeStep data={data} tools={included} patchTool={patchTool} people={people} /> : null}
      {step === "review" ? (
        <ReviewStep
          data={data}
          tools={included}
          blockers={blockers}
          patchTool={patchTool}
          people={people}
          onActivate={() => {
            setData((current) => ({ ...current, enabled: true }));
            setStep("card");
          }}
        />
      ) : null}
      {step === "card" ? <CardStep data={data} tools={included} blockers={blockers} setData={setData} onEdit={() => setStep("scope")} /> : null}
      <nav className="flex items-center justify-between border-t border-border pt-4">
        <button type="button" className={cn(GHOST, index === 0 ? "invisible" : "")} onClick={() => setStep(STEPS[index - 1] ?? "connect")}>
          {COPY.previous}
        </button>
        {index < STEPS.length - 2 ? (
          <button type="button" className={INK} onClick={() => setStep(STEPS[index + 1] ?? "card")}>
            {COPY.next}
          </button>
        ) : null}
      </nav>
    </div>
  );
}
