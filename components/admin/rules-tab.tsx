import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { AuditEntry } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { dryRun, policyRules, type PolicyRule } from "@/lib/access/policy-rules";
import { auditLog } from "@/lib/server/audit";
import { TH } from "@/lib/i18n/th";
import { addRuleAction, moveRuleAction, removeRuleAction, setRuleEnabledAction, updateRuleAction } from "@/app/(app)/admin/actions";
import { EmptyLine, FOCUS, Panel, Pill, SwitchButton, stamp } from "./parts";
import { RuleForm } from "./rule-form";

const COPY = TH.admin.rulesTab;
const DRY_RUN_ROWS = 500;
const ICON_BUTTON = `inline-flex size-8 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition hover:border-foreground/25 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 ${FOCUS}`;

function latestAudit(): AuditEntry[] {
  return [...auditLog().all()].sort((left, right) => right.at.localeCompare(left.at)).slice(0, DRY_RUN_ROWS);
}

function MoveButton({ rule, step, disabled }: { rule: PolicyRule; step: "up" | "down"; disabled: boolean }) {
  const Icon = step === "up" ? ArrowUp : ArrowDown;
  const label = step === "up" ? COPY.moveUp : COPY.moveDown;
  return (
    <form action={moveRuleAction}>
      <input type="hidden" name="rule" value={rule.id} />
      <input type="hidden" name="step" value={step} />
      <button type="submit" disabled={disabled} aria-label={`${rule.name}: ${label}`} title={label} className={ICON_BUTTON}>
        <Icon className="size-3.5" aria-hidden />
      </button>
    </form>
  );
}

function RuleRow({ rule, position, count, audit }: { rule: PolicyRule; position: number; count: number; audit: readonly AuditEntry[] }) {
  const replay = dryRun(rule, audit);
  return (
    <li className="flex flex-col gap-3 border-t border-border px-5 py-4 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums text-muted-foreground">{position + 1}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className={cn("text-sm font-medium", rule.enabled ? "" : "text-muted-foreground")}>{rule.name}</p>
              <Pill tone={rule.enabled ? "danger" : "neutral"}>{rule.enabled ? COPY.on : COPY.off}</Pill>
            </div>
            <code className="mt-1.5 block break-all rounded-xl bg-muted/50 px-2.5 py-1.5 font-mono text-[12px] text-foreground/85">{rule.when}</code>
            <p className="mt-1.5 text-[11px] text-muted-foreground">{COPY.changed(findUser(rule.by)?.nameTh ?? rule.by, stamp(rule.at))}</p>
            <p className={cn("mt-0.5 text-[12px]", replay.refused > 0 ? "text-warning" : "text-muted-foreground")}>
              {replay.total > 0 ? COPY.dryRun(replay.refused, replay.total) : COPY.dryRunNone}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <MoveButton rule={rule} step="up" disabled={position === 0} />
          <MoveButton rule={rule} step="down" disabled={position === count - 1} />
          <form action={removeRuleAction}>
            <input type="hidden" name="rule" value={rule.id} />
            <button type="submit" aria-label={`${rule.name}: ${COPY.remove}`} title={COPY.remove} className={cn(ICON_BUTTON, "hover:text-danger")}>
              <Trash2 className="size-3.5" aria-hidden />
            </button>
          </form>
          <form action={setRuleEnabledAction} className="ml-1.5">
            <input type="hidden" name="rule" value={rule.id} />
            <input type="hidden" name="enabled" value={String(!rule.enabled)} />
            <SwitchButton on={rule.enabled} label={`${rule.name}: ${rule.enabled ? COPY.on : COPY.off}`} />
          </form>
        </div>
      </div>
      <details className="group ml-9">
        <summary className={cn("w-fit cursor-pointer list-none rounded-full text-xs text-muted-foreground hover:text-foreground", FOCUS)}>{COPY.edit}</summary>
        <div className="mt-2.5 max-w-2xl">
          <RuleForm action={updateRuleAction} ruleId={rule.id} initialName={rule.name} initialWhen={rule.when} submitLabel={COPY.save} />
        </div>
      </details>
    </li>
  );
}

function VariableReference() {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-border bg-muted/40 p-4">
      <p className="text-xs font-medium text-muted-foreground">{COPY.variablesTitle}</p>
      <dl className="flex flex-col gap-2">
        {COPY.variables.map((variable) => (
          <div key={variable.name}>
            <dt className="font-mono text-[12px] font-medium text-foreground">{variable.name}</dt>
            <dd className="text-[12px] leading-relaxed text-muted-foreground">{variable.body}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function RulesTab() {
  const rules = policyRules();
  const audit = latestAudit();
  return (
    <div className="flex flex-col gap-4">
      <Panel title={COPY.title} hint={COPY.hint} bodyClassName={rules.length > 0 ? "px-0 pb-1" : undefined}>
        {rules.length === 0 ? (
          <EmptyLine text={COPY.empty} />
        ) : (
          <ol>
            {rules.map((rule, index) => (
              <RuleRow key={rule.id} rule={rule} position={index} count={rules.length} audit={audit} />
            ))}
          </ol>
        )}
      </Panel>

      <Panel title={COPY.addTitle} hint={COPY.addHint}>
        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <RuleForm action={addRuleAction} submitLabel={COPY.add} clearOnSave showExamples />
          <VariableReference />
        </div>
      </Panel>
    </div>
  );
}
