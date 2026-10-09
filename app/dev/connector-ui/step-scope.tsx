"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { EmptyLine, FIELD, FOCUS, GHOST, Panel, Pill, Select } from "@/components/admin/parts";
import type { RoleId } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { testToolAction } from "./actions";
import {
  FILTER_KINDS, guessField, isWrite,
  type DiscoveredTool, type FilterKind, type FilterPreset, type GuardPreset, type IdentityKey, type InjectPreset, type PinKey, type ScopeDraft, type SensitiveDraft, type ToolDraft, type VerifyDraft, type Visibility, type WriteDraft,
} from "./model";
import { Check, Label, Segmented, type Person } from "./parts";
import type { ToolPatch, WizardData } from "./wizard";

const COPY = TH.connectorUi.scope;
const WRITE = TH.connectorUi.write;
const VISIBILITIES: readonly Visibility[] = ["full", "masked", "none"];
const IDENTITY_KEYS: readonly IdentityKey[] = ["employee_id", "department_id"];
const PIN_KEYS: readonly (PinKey | "model")[] = ["model", "employee_id", "department_id", "call_id"];
const INJECT_VALUES = ["regions", "employee_id", "department_id"] as const;
const FALLBACK_SAMPLER = "u_anucha";
const EXAMPLE_LIMIT_THB = 20000;

type InjectValue = (typeof INJECT_VALUES)[number];

function presetOf(kind: FilterKind, fields: readonly string[]): FilterPreset {
  const field = guessField(kind, fields);
  return kind === "own_rows" ? { kind, field, key: "employee_id" } : { kind, field };
}

function injectOf(value: InjectValue, arg: string): InjectPreset {
  return value === "regions" ? { kind: "inject_regions", arg } : { kind: "inject_identity", arg, key: value };
}

function injectValueOf(inject: InjectPreset): InjectValue {
  return inject.kind === "inject_regions" ? "regions" : inject.key;
}

function FieldSelect({ value, fields, onChange, label }: { value: string; fields: readonly string[]; onChange: (next: string) => void; label: string }) {
  return (
    <Select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="min-w-[10rem]">
      {fields.includes(value) || !value ? null : <option value={value}>{value}</option>}
      {fields.map((field) => (
        <option key={field} value={field}>
          {field}
        </option>
      ))}
    </Select>
  );
}

function ScopeChoice({ tool, remote, fields, patch }: { tool: ToolDraft; remote: DiscoveredTool; fields: string[]; patch: (next: ToolPatch) => void }) {
  const scope = tool.scope;
  const setScope = (next: ScopeDraft) => patch((current) => ({ ...current, scope: next }));
  const modes = [
    { id: "scoped" as const, label: COPY.limit, pick: () => setScope({ kind: "scoped", filter: presetOf("own_rows", fields), inject: null }) },
    { id: "none" as const, label: COPY.noLimit, pick: () => setScope({ kind: "none", reason: "" }) },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        {modes.map((mode) => (
          <button key={mode.id} type="button" aria-pressed={scope.kind === mode.id} onClick={mode.pick} className={cn("h-9 rounded-full border px-4 text-[13px] transition", FOCUS, scope.kind === mode.id ? "border-transparent bg-ink text-ink-foreground" : "border-border bg-card hover:border-foreground/25")}>
            {mode.label}
          </button>
        ))}
      </div>
      {scope.kind === "none" ? (
        <label className="flex flex-col gap-1.5">
          <Label>{COPY.reason}</Label>
          <input className={FIELD} value={scope.reason} placeholder={COPY.reasonPlaceholder} onChange={(event) => setScope({ kind: "none", reason: event.target.value })} />
        </label>
      ) : null}
      {scope.kind === "scoped" ? (
        <div className="flex flex-col gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {FILTER_KINDS.map((kind) => (
              <label key={kind} className={cn("flex cursor-pointer gap-2.5 rounded-2xl border p-3 transition", scope.filter.kind === kind ? "border-foreground/40 bg-card shadow-card" : "border-border bg-muted/30 hover:border-foreground/20")}>
                <input type="radio" name={`preset-${tool.name}`} checked={scope.filter.kind === kind} onChange={() => setScope({ ...scope, filter: presetOf(kind, fields) })} className="mt-1 accent-[var(--color-ink)]" />
                <span className="flex flex-col gap-0.5">
                  <span className="text-[13px] font-medium">{COPY.presets[kind].label}</span>
                  <span className="text-[12px] leading-relaxed text-muted-foreground">{COPY.presets[kind].body}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            <span className="text-muted-foreground">{COPY.field}</span>
            <FieldSelect value={scope.filter.field} fields={fields} label={COPY.field} onChange={(field) => setScope({ ...scope, filter: { ...scope.filter, field } })} />
            {scope.filter.kind === "own_rows" ? (
              <>
                <span className="text-muted-foreground">{COPY.key}</span>
                <Select value={scope.filter.key} aria-label={COPY.key} onChange={(event) => setScope({ ...scope, filter: { kind: "own_rows", field: scope.filter.field, key: event.target.value as IdentityKey } })}>
                  {IDENTITY_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {COPY.keys[key]}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
          </div>
          <p className="text-[12px] text-muted-foreground">{COPY.missingRule}</p>
          <div className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3">
            <Check checked={scope.inject !== null} onChange={(on) => setScope({ ...scope, inject: on ? injectOf("regions", remote.inputs[0]?.name ?? "") : null })}>
              <span className="font-medium">{COPY.inject}</span>
              <span className="block text-[12px] text-muted-foreground">{COPY.injectHint}</span>
            </Check>
            {scope.inject ? (
              <div className="flex flex-wrap items-center gap-2 pl-6 text-[13px]">
                <span className="text-muted-foreground">{COPY.injectArg}</span>
                <FieldSelect value={scope.inject.arg} fields={remote.inputs.map((input) => input.name)} label={COPY.injectArg} onChange={(arg) => scope.inject && setScope({ ...scope, inject: { ...scope.inject, arg } })} />
                <span className="text-muted-foreground">{COPY.injectValue}</span>
                <Select value={injectValueOf(scope.inject)} aria-label={COPY.injectValue} onChange={(event) => scope.inject && setScope({ ...scope, inject: injectOf(event.target.value as InjectValue, scope.inject.arg) })}>
                  {INJECT_VALUES.map((value) => (
                    <option key={value} value={value}>
                      {COPY.injectValues[value]}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SensitiveFields({ tool, fields, patch }: { tool: ToolDraft; fields: string[]; patch: (next: ToolPatch) => void }) {
  const marked = new Map(tool.sensitive.map((item) => [item.field, item]));
  const setSensitive = (next: (sensitive: SensitiveDraft[]) => SensitiveDraft[]) => patch((current) => ({ ...current, sensitive: next(current.sensitive) }));
  const toggle = (field: string) =>
    setSensitive((sensitive) => (sensitive.some((item) => item.field === field) ? sensitive.filter((item) => item.field !== field) : [...sensitive, { field, byRole: {}, ownerField: null }]));
  const update = (field: string, next: (item: SensitiveDraft) => SensitiveDraft) => setSensitive((sensitive) => sensitive.map((item) => (item.field === field ? next(item) : item)));
  return (
    <div className="flex flex-col gap-3">
      <Label hint={COPY.sensitiveHint}>{COPY.sensitive}</Label>
      <div className="flex flex-wrap gap-1.5">
        {fields.map((field) => (
          <button key={field} type="button" aria-pressed={marked.has(field)} onClick={() => toggle(field)} className={cn("rounded-full border px-2.5 py-1 font-mono text-[12px] transition", FOCUS, marked.has(field) ? "border-warning/50 bg-warning/14 text-warning" : "border-border bg-card text-muted-foreground hover:text-foreground")}>
            {field}
          </button>
        ))}
      </div>
      {tool.sensitive.map((item) => (
        <div key={item.field} className="rounded-2xl border border-border p-3">
          <p className="mb-2 font-mono text-[12px] font-medium">{item.field}</p>
          {tool.roles.length === 0 ? <p className="text-[12px] text-muted-foreground">{COPY.noRoles}</p> : null}
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {tool.roles.map((role: RoleId) => (
              <div key={role} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="truncate">{TH.role[role]}</span>
                <Segmented
                  value={item.byRole[role] ?? "none"}
                  label={`${item.field} · ${TH.role[role]}`}
                  options={VISIBILITIES.map((id) => ({ id, label: COPY.visibility[id] }))}
                  onChange={(visibility) => update(item.field, (current) => ({ ...current, byRole: { ...current.byRole, [role]: visibility } }))}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Check checked={item.ownerField !== null} onChange={(on) => update(item.field, (current) => ({ ...current, ownerField: on ? guessField("own_rows", fields) : null }))}>
              {COPY.ownerSees}
            </Check>
            {item.ownerField !== null ? <FieldSelect value={item.ownerField} fields={fields} label={COPY.ownerSees} onChange={(ownerField) => update(item.field, (current) => ({ ...current, ownerField }))} /> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function pinOf(write: WriteDraft, arg: string): PinKey | "model" {
  return write.pins.find((pin) => pin.arg === arg)?.key ?? "model";
}

function withPin(write: WriteDraft, arg: string, key: PinKey | "model"): WriteDraft {
  const pins = write.pins.filter((pin) => pin.arg !== arg);
  return { ...write, pins: key === "model" ? pins : [...pins, { arg, key }] };
}

function guardOf(remote: DiscoveredTool, readTools: readonly DiscoveredTool[]): GuardPreset {
  const arg = remote.inputs.find((input) => /(_id|_no)$/.test(input.name) && !/^(requester|holder|employee|approver)_id$/.test(input.name))?.name ?? remote.inputs[0]?.name ?? "";
  const readTool = readTools.find((tool) => tool.fields.includes(arg) && tool.inputs.length > 1) ?? readTools.find((tool) => tool.fields.includes(arg)) ?? readTools[0];
  return { arg, readTool: readTool?.name ?? "", field: readTool?.fields.includes(arg) ? arg : (readTool?.fields[0] ?? "") };
}

function verifyOf(kind: VerifyDraft["kind"], remote: DiscoveredTool, readTools: readonly DiscoveredTool[]): VerifyDraft {
  const idField = remote.fields.find((field) => /(_id|_no)$/.test(field) && !remote.inputs.some((input) => input.name === field)) ?? remote.fields[0] ?? "";
  const compare = remote.inputs.map((input) => input.name).filter((name) => remote.fields.includes(name) && name !== "idempotency_key");
  if (kind === "echo") return { kind, idField, compare };
  if (kind === "read_back") {
    const readTool = readTools.find((tool) => tool.inputs.some((input) => input.name === idField)) ?? readTools[0];
    return { kind, idField, readTool: readTool?.name ?? "", readArg: readTool?.inputs[0]?.name ?? "", compare };
  }
  return { kind: "unset" };
}

function WriteSection({ tool, remote, remotes, connectorId, patch }: { tool: ToolDraft; remote: DiscoveredTool; remotes: DiscoveredTool[]; connectorId: string; patch: (next: ToolPatch) => void }) {
  const write = tool.write;
  const setWrite = (next: (write: WriteDraft) => WriteDraft) => patch((current) => ({ ...current, write: next(current.write) }));
  const readTools = remotes.filter((item) => item.hints.readOnly === true);
  const stringInputs = remote.inputs.filter((input) => input.type.includes("string"));
  const amount = remote.inputs.find((input) => input.type === "number" && /amount|value|thb/i.test(input.name));
  const pinsCallId = write.pins.some((pin) => pin.key === "call_id");
  const verify = write.verify;
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-primary/25 bg-primary/[0.03] p-4">
      <header className="flex flex-wrap items-center gap-2">
        <h3 className="text-[14px] font-semibold">{WRITE.title}</h3>
        <Pill tone="primary">{WRITE.phase}</Pill>
      </header>
      <p className="flex items-start gap-2 text-[13px]">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        {WRITE.approval}
      </p>
      <div className="flex flex-col gap-2">
        <Label hint={WRITE.pinsHint}>{WRITE.pins}</Label>
        <ul className="grid gap-2 sm:grid-cols-2">
          {remote.inputs.map((input) => (
            <li key={input.name} className="flex items-center justify-between gap-2 rounded-2xl border border-border bg-card px-3 py-2">
              <code className="truncate font-mono text-[12px]">{input.name}</code>
              <Select value={pinOf(write, input.name)} aria-label={`${WRITE.pins} ${input.name}`} onChange={(event) => setWrite((current) => withPin(current, input.name, event.target.value as PinKey | "model"))}>
                {PIN_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {WRITE.pinOptions[key]}
                  </option>
                ))}
              </Select>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-2">
        <Label hint={WRITE.guardHint}>{WRITE.guard}</Label>
        <Check checked={write.guard !== null} onChange={(on) => setWrite((current) => ({ ...current, guard: on ? guardOf(remote, readTools) : null }))}>
          {WRITE.guardOn}
        </Check>
        {write.guard ? (
          <div className="flex flex-wrap items-center gap-2 pl-6 text-[13px]">
            <span className="text-muted-foreground">{WRITE.guardArg}</span>
            <FieldSelect value={write.guard.arg} fields={remote.inputs.map((input) => input.name)} label={WRITE.guardArg} onChange={(arg) => setWrite((current) => (current.guard ? { ...current, guard: { ...current.guard, arg } } : current))} />
            <span className="text-muted-foreground">{WRITE.guardTool}</span>
            <FieldSelect value={write.guard.readTool} fields={readTools.map((item) => item.name)} label={WRITE.guardTool} onChange={(readTool) => setWrite((current) => (current.guard ? { ...current, guard: { ...current.guard, readTool } } : current))} />
            <span className="text-muted-foreground">{WRITE.guardField}</span>
            <FieldSelect value={write.guard.field} fields={readTools.find((item) => item.name === write.guard?.readTool)?.fields ?? []} label={WRITE.guardField} onChange={(field) => setWrite((current) => (current.guard ? { ...current, guard: { ...current.guard, field } } : current))} />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <Label hint={WRITE.redactHint}>{WRITE.redact}</Label>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {stringInputs.map((input) => (
            <Check key={input.name} checked={write.redact.includes(input.name)} onChange={(on) => setWrite((current) => ({ ...current, redact: on ? [...current.redact, input.name] : current.redact.filter((name) => name !== input.name) }))}>
              <code className="font-mono text-[12px]">{input.name}</code>
            </Check>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label hint={WRITE.verifyHint}>{WRITE.verify}</Label>
        <Segmented
          value={verify.kind}
          label={WRITE.verify}
          options={(["unset", "echo", "read_back"] as const).map((id) => ({ id, label: WRITE.verifyKinds[id] }))}
          onChange={(kind) => setWrite((current) => ({ ...current, verify: verifyOf(kind, remote, readTools) }))}
        />
        {verify.kind !== "unset" ? (
          <div className="flex flex-col gap-2 text-[13px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">{WRITE.idField}</span>
              <FieldSelect value={verify.idField} fields={remote.fields} label={WRITE.idField} onChange={(idField) => setWrite((current) => ({ ...current, verify: { ...verify, idField } }))} />
              {verify.kind === "read_back" ? (
                <>
                  <span className="text-muted-foreground">{WRITE.readTool}</span>
                  <FieldSelect value={verify.readTool} fields={readTools.map((item) => item.name)} label={WRITE.readTool} onChange={(readTool) => setWrite((current) => ({ ...current, verify: { ...verify, readTool, readArg: readTools.find((item) => item.name === readTool)?.inputs[0]?.name ?? "" } }))} />
                  <span className="text-muted-foreground">{WRITE.readArg}</span>
                  <FieldSelect value={verify.readArg} fields={readTools.find((item) => item.name === verify.readTool)?.inputs.map((input) => input.name) ?? []} label={WRITE.readArg} onChange={(readArg) => setWrite((current) => ({ ...current, verify: { ...verify, readArg } }))} />
                </>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="text-muted-foreground">{WRITE.compare}</span>
              {remote.inputs.filter((input) => remote.fields.includes(input.name)).map((input) => (
                <Check key={input.name} checked={verify.compare.includes(input.name)} onChange={(on) => setWrite((current) => (current.verify.kind === "unset" ? current : { ...current, verify: { ...current.verify, compare: on ? [...current.verify.compare, input.name] : current.verify.compare.filter((name) => name !== input.name) } }))}>
                  <code className="font-mono text-[12px]">{input.name}</code>
                </Check>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      {pinsCallId ? null : (
        <Check checked={write.noIdempotencyAck} onChange={(noIdempotencyAck) => setWrite((current) => ({ ...current, noIdempotencyAck }))}>
          {WRITE.noIdempotency}
        </Check>
      )}
      {amount ? (
        <div className="flex flex-col gap-1.5">
          <Label hint={WRITE.limitHint}>{WRITE.limit}</Label>
          <code className="block overflow-x-auto rounded-2xl bg-muted px-3 py-2 font-mono text-[12px]">{`tool.name == "${connectorId}__${remote.name}" && args.${amount.name} > ${EXAMPLE_LIMIT_THB} && user.role == "sales_rep"`}</code>
          <Link href="/admin?tab=rules" className={cn("self-start text-[12px] font-medium underline underline-offset-4", FOCUS)}>
            {WRITE.limitLink}
          </Link>
        </div>
      ) : null}
    </section>
  );
}

function ScopeCard({ tool, data, people, patch }: { tool: ToolDraft; data: WizardData; people: Person[]; patch: (next: ToolPatch) => void }) {
  const remote = data.remote.find((item) => item.name === tool.name);
  const [sampled, setSampled] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  if (!remote) return null;
  const fields = [...new Set([...remote.fields, ...(tool.test?.fields ?? []), ...sampled])];
  const sample = () =>
    startTransition(async () => {
      const asUser = people.find((person) => tool.roles.includes(person.role))?.id ?? FALLBACK_SAMPLER;
      const probe: ToolDraft = { ...tool, tier: "read", scope: { kind: "none", reason: COPY.fieldsFromSample } };
      const result = await testToolAction({ draftKey: data.connector.draftKey ?? "", tool: probe, remote, asUser });
      if (result.ok) setSampled(result.test.fields);
    });
  return (
    <li className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="text-[15px] font-semibold">{tool.labelTh || tool.name}</h3>
          <p className="font-mono text-[11px] text-muted-foreground">{tool.name}</p>
        </div>
        <Pill tone={tool.tier === "read" ? "neutral" : tool.tier === "write" ? "primary" : "warning"}>{TH.admin.tier[tool.tier]}</Pill>
      </header>
      {fields.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-muted/40 px-3.5 py-2.5 text-[13px]">
          <span className="text-muted-foreground">{COPY.noFields}</span>
          <button type="button" className={GHOST} onClick={sample} disabled={pending}>
            {pending ? COPY.fieldsLoading : COPY.fieldsFromSample}
          </button>
        </div>
      ) : null}
      <ScopeChoice tool={tool} remote={remote} fields={fields} patch={patch} />
      {fields.length > 0 ? <SensitiveFields tool={tool} fields={fields} patch={patch} /> : null}
      {isWrite(tool) ? <WriteSection tool={tool} remote={remote} remotes={data.remote} connectorId={data.connector.id} patch={patch} /> : null}
    </li>
  );
}

export function ScopeStep({ data, tools, patchTool, people }: { data: WizardData; tools: ToolDraft[]; patchTool: (name: string, patch: ToolPatch) => void; people: Person[] }) {
  return (
    <Panel title={TH.connectorUi.steps.scope} hint={COPY.hint}>
      {tools.length === 0 ? (
        <EmptyLine text={TH.connectorUi.roles.empty} />
      ) : (
        <ul className="flex flex-col gap-4">
          {tools.map((tool) => (
            <ScopeCard key={tool.name} tool={tool} data={data} people={people} patch={(patch) => patchTool(tool.name, patch)} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
