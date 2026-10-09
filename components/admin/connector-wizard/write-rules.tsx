"use client";

import { cn } from "@/components/ui/cn";
import { FIELD, FOCUS, Select } from "@/components/admin/parts";
import { TH } from "@/lib/i18n/th";
import { inputNamesOf, VERIFY_KINDS, type IdentityKey, type VerifyKind, type WriteDraft, type WriteGuard, type WritePin, type WriteVerify } from "@/lib/connectors/spec";
import { readToolsOf, type WizardTool } from "./model";
import { Check, Label, Segmented } from "./parts";
import type { DraftPatch, WizardContext } from "./wizard";

const COPY = TH.connectorUi.write;
const PIN_CHOICES = ["none", "employee_id", "department_id", "call_id"] as const;

type PinChoice = (typeof PIN_CHOICES)[number];

function pinChoiceOf(pins: readonly WritePin[], arg: string): PinChoice {
  const pin = pins.find((item) => item.arg === arg);
  if (!pin) return "none";
  return pin.kind === "call_id" ? "call_id" : pin.key;
}

function pinsWith(pins: readonly WritePin[], arg: string, choice: PinChoice): WritePin[] {
  const rest = pins.filter((pin) => pin.arg !== arg);
  if (choice === "none") return rest;
  return [...rest, choice === "call_id" ? { kind: "call_id", arg } : { kind: "identity", arg, key: choice as IdentityKey }];
}

function toggled(list: readonly string[], item: string): string[] {
  return list.includes(item) ? list.filter((value) => value !== item) : [...list, item];
}

function Chips({ options, chosen, onToggle, tone = "neutral" }: { options: readonly string[]; chosen: readonly string[]; onToggle: (item: string) => void; tone?: "neutral" | "warning" }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = chosen.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={cn(
              "rounded-full border px-2.5 py-1 font-mono text-[12px] transition",
              FOCUS,
              on ? (tone === "warning" ? "border-warning/50 bg-warning/14 text-warning" : "border-foreground/40 bg-card text-foreground shadow-card") : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function NameSelect({ value, options, onChange, label }: { value: string; options: readonly string[]; onChange: (next: string) => void; label: string }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="min-w-[10rem]">
      {value === "" ? <option value="">–</option> : null}
      {options.includes(value) || !value ? null : <option value={value}>{value}</option>}
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </Select>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-border p-3.5">
      <Label hint={hint}>{title}</Label>
      {children}
    </div>
  );
}

function Pins({ write, inputs, set }: { write: WriteDraft; inputs: readonly string[]; set: (next: WriteDraft) => void }) {
  return (
    <Section title={COPY.pins} hint={COPY.pinsHint}>
      <div className="grid gap-2 sm:grid-cols-2">
        {inputs.map((arg) => (
          <label key={arg} className="flex items-center justify-between gap-2 text-[13px]">
            <code className="font-mono text-[12px]">{arg}</code>
            <Select value={pinChoiceOf(write.pins, arg)} aria-label={`${COPY.pins} ${arg}`} onChange={(event) => set({ ...write, pins: pinsWith(write.pins, arg, event.target.value as PinChoice) })}>
              {PIN_CHOICES.map((choice) => (
                <option key={choice} value={choice}>
                  {choice === "none" ? COPY.pinNone : COPY.pinValues[choice]}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
    </Section>
  );
}

function Guard({ write, inputs, readTools, set }: { write: WriteDraft; inputs: readonly string[]; readTools: readonly WizardTool[]; set: (next: WriteDraft) => void }) {
  const guard = write.guards[0] ?? null;
  const helper = readTools.find((tool) => tool.name === guard?.tool);
  const setGuard = (next: WriteGuard | null) => set({ ...write, guards: next ? [next] : [] });
  const first = readTools[0];
  return (
    <Section title={COPY.guard} hint={COPY.guardHint}>
      {readTools.length === 0 ? <p className="text-[12px] text-muted-foreground">{COPY.noReadTools}</p> : null}
      <Check checked={guard !== null} disabled={!first} onChange={(on) => setGuard(on && first ? { arg: inputs[0] ?? "", tool: first.name, field: first.fields[0] ?? "" } : null)}>
        {COPY.guard}
      </Check>
      {guard ? (
        <div className="flex flex-wrap items-center gap-2 pl-6 text-[13px]">
          <span className="text-muted-foreground">{COPY.guardArg}</span>
          <NameSelect value={guard.arg} options={inputs} label={COPY.guardArg} onChange={(arg) => setGuard({ ...guard, arg })} />
          <span className="text-muted-foreground">{COPY.guardTool}</span>
          <NameSelect value={guard.tool} options={readTools.map((tool) => tool.name)} label={COPY.guardTool} onChange={(tool) => setGuard({ ...guard, tool, field: readTools.find((item) => item.name === tool)?.fields[0] ?? "" })} />
          <span className="text-muted-foreground">{COPY.guardField}</span>
          <NameSelect value={guard.field} options={helper?.fields ?? []} label={COPY.guardField} onChange={(field) => setGuard({ ...guard, field })} />
        </div>
      ) : null}
    </Section>
  );
}

function verifyOf(kind: VerifyKind, inputs: readonly string[], readTools: readonly WizardTool[], current: WriteVerify | null): WriteVerify {
  const fields = current?.fields ?? [];
  if (kind === "echo") return { kind, idField: current?.idField ?? "", fields: fields.filter((field) => inputs.includes(field)) };
  const tool = readTools[0];
  const toolInputs = tool?.listed ? inputNamesOf(tool.listed.inputSchema) : [];
  return { kind, tool: tool?.name ?? "", idArg: toolInputs[0] ?? "", idField: current?.idField ?? "", fields: fields.filter((field) => inputs.includes(field)) };
}

function Verify({ write, inputs, readTools, set }: { write: WriteDraft; inputs: readonly string[]; readTools: readonly WizardTool[]; set: (next: WriteDraft) => void }) {
  const verify = write.verify;
  const setVerify = (next: WriteVerify) => set({ ...write, verify: next });
  const helper = verify?.kind === "read_back" ? readTools.find((tool) => tool.name === verify.tool) : undefined;
  const helperInputs = helper?.listed ? inputNamesOf(helper.listed.inputSchema) : [];
  return (
    <Section title={COPY.verify} hint={COPY.verifyHint}>
      <Segmented
        value={verify?.kind ?? ("" as VerifyKind)}
        label={COPY.verify}
        options={VERIFY_KINDS.map((id) => ({ id, label: COPY.verifyKinds[id] }))}
        onChange={(kind) => setVerify(verifyOf(kind, inputs, readTools, verify))}
      />
      {verify?.kind === "read_back" ? (
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-muted-foreground">{COPY.readBackTool}</span>
          <NameSelect value={verify.tool} options={readTools.map((tool) => tool.name)} label={COPY.readBackTool} onChange={(tool) => setVerify({ ...verify, tool })} />
          <span className="text-muted-foreground">{COPY.idArg}</span>
          <NameSelect value={verify.idArg} options={helperInputs} label={COPY.idArg} onChange={(idArg) => setVerify({ ...verify, idArg })} />
        </div>
      ) : null}
      {verify ? (
        <>
          <label className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">{COPY.idField}</span>
            <input className={cn(FIELD, "h-9 w-48 font-mono text-[12px]")} value={verify.idField} placeholder="request_id" onChange={(event) => setVerify({ ...verify, idField: event.target.value.trim() })} />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="text-[12px] text-muted-foreground">{COPY.compare}</span>
            <Chips options={inputs} chosen={verify.fields} onToggle={(field) => setVerify({ ...verify, fields: toggled(verify.fields, field) })} />
          </div>
        </>
      ) : null}
    </Section>
  );
}

/** What a write or destructive tool may touch and how Winyu checks it: pins, a guard, personal-text arguments, the post-condition and the idempotency key or the admin's acknowledgement. */
export function WriteRules({ tool, context }: { tool: WizardTool; context: WizardContext }) {
  const write = tool.draft.write;
  if (!write || !tool.listed) return null;
  const inputs = inputNamesOf(tool.listed.inputSchema);
  const readTools = readToolsOf(context.tools, tool.name);
  const set = (next: WriteDraft) => context.patchDraft(tool.name, ((current) => ({ ...current, write: next })) satisfies DraftPatch);
  const keyed = write.pins.some((pin) => pin.kind === "call_id");
  return (
    <div className="flex flex-col gap-3">
      <Label hint={COPY.hint}>{COPY.title}</Label>
      <Pins write={write} inputs={inputs} set={set} />
      <Guard write={write} inputs={inputs} readTools={readTools} set={set} />
      <Section title={COPY.redact} hint={COPY.redactHint}>
        <Chips options={inputs} chosen={write.redact} tone="warning" onToggle={(arg) => set({ ...write, redact: toggled(write.redact, arg) })} />
      </Section>
      <Verify write={write} inputs={inputs} readTools={readTools} set={set} />
      {keyed ? (
        <p className="rounded-2xl bg-success/10 px-3.5 py-2.5 text-[13px]">{COPY.idempotent}</p>
      ) : (
        <Check checked={write.duplicateRisk} onChange={(duplicateRisk) => set({ ...write, duplicateRisk })} className="rounded-2xl bg-warning/10 px-3.5 py-2.5">
          {COPY.duplicateRisk}
        </Check>
      )}
      <p className="text-[12px] text-muted-foreground">{COPY.replyNote}</p>
    </div>
  );
}
