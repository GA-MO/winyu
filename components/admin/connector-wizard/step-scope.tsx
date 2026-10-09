"use client";

import { useState, useTransition } from "react";
import { cn } from "@/components/ui/cn";
import { EmptyLine, FIELD, FOCUS, GHOST, Panel, Select } from "@/components/admin/parts";
import { ROLE_IDS } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { sampleToolFieldsAction } from "@/app/(app)/admin/actions";
import {
  FILTER_KINDS, IDENTITY_KEYS, VISIBILITIES, guessField, inputNamesOf,
  type FilterKind, type FilterPreset, type IdentityKey, type InjectPreset, type ScopeDraft, type SensitiveSpec,
} from "@/lib/connectors/spec";
import { defaultPersonFor, type WizardTool } from "./model";
import { Check, Label, ProblemLine, Segmented } from "./parts";
import { WriteRules } from "./write-rules";
import type { DraftPatch, WizardContext } from "./wizard";

const COPY = TH.connectorUi.scope;
const INJECT_VALUES = ["regions", "employee_id", "department_id"] as const;

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
      {value === "" ? <option value="">–</option> : null}
      {fields.includes(value) || !value ? null : <option value={value}>{value}</option>}
      {fields.map((field) => (
        <option key={field} value={field}>
          {field}
        </option>
      ))}
    </Select>
  );
}

function ScopedChoice({ tool, scope, fields, setScope }: { tool: WizardTool; scope: Extract<ScopeDraft, { kind: "scoped" }>; fields: string[]; setScope: (next: ScopeDraft) => void }) {
  const inputs = tool.listed ? inputNamesOf(tool.listed.inputSchema) : [];
  return (
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
        <Check checked={scope.inject !== null} onChange={(on) => setScope({ ...scope, inject: on ? injectOf("regions", inputs[0] ?? "") : null })}>
          <span className="font-medium">{COPY.inject}</span>
          <span className="block text-[12px] text-muted-foreground">{COPY.injectHint}</span>
        </Check>
        {scope.inject ? (
          <div className="flex flex-wrap items-center gap-2 pl-6 text-[13px]">
            <span className="text-muted-foreground">{COPY.injectArg}</span>
            <FieldSelect value={scope.inject.arg} fields={inputs} label={COPY.injectArg} onChange={(arg) => scope.inject && setScope({ ...scope, inject: { ...scope.inject, arg } })} />
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
  );
}

function ScopeChoice({ tool, fields, patch }: { tool: WizardTool; fields: string[]; patch: (next: DraftPatch) => void }) {
  const scope = tool.draft.scope;
  const setScope = (next: ScopeDraft) => patch((current) => ({ ...current, scope: next }));
  const modes = [
    { id: "scoped" as const, label: COPY.limit, pick: () => setScope({ kind: "scoped", filter: presetOf("people_line", fields), inject: null }) },
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
      {scope.kind === "scoped" ? <ScopedChoice tool={tool} scope={scope} fields={fields} setScope={setScope} /> : null}
    </div>
  );
}

function SensitiveFields({ tool, fields, patch }: { tool: WizardTool; fields: string[]; patch: (next: DraftPatch) => void }) {
  const draft = tool.draft;
  const marked = new Set(draft.sensitive.map((item) => item.field));
  const setSensitive = (next: (sensitive: SensitiveSpec[]) => SensitiveSpec[]) => patch((current) => ({ ...current, sensitive: next(current.sensitive) }));
  const toggle = (field: string) => setSensitive((sensitive) => (sensitive.some((item) => item.field === field) ? sensitive.filter((item) => item.field !== field) : [...sensitive, { field, byRole: {}, ownerField: null }]));
  const update = (field: string, next: (item: SensitiveSpec) => SensitiveSpec) => setSensitive((sensitive) => sensitive.map((item) => (item.field === field ? next(item) : item)));
  const roles = ROLE_IDS.filter((role) => draft.roles.includes(role));
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
      {draft.sensitive.map((item) => (
        <div key={item.field} className="rounded-2xl border border-border p-3">
          <p className="mb-2 font-mono text-[12px] font-medium">{item.field}</p>
          {roles.length === 0 ? <p className="text-[12px] text-muted-foreground">{COPY.noRoles}</p> : null}
          <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {roles.map((role) => (
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


function FieldSampler({ tool, context }: { tool: WizardTool; context: WizardContext }) {
  const [asUser, setAsUser] = useState(() => defaultPersonFor(tool, context.people));
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const sample = () =>
    startTransition(async () => {
      setProblem(null);
      const result = await sampleToolFieldsAction({ connector: context.view.connector.id, tool: tool.name, asUser });
      if (result.ok && result.fields.length === 0) setProblem(COPY.noRows);
      if (result.ok) context.addFields(tool.name, result.fields);
      else setProblem(TH.connectorUi.problems[result.problem]);
    });
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-muted/40 px-3.5 py-2.5 text-[13px]">
      {tool.fields.length === 0 ? <span className="text-muted-foreground">{COPY.noFields}</span> : null}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground">{COPY.sampleAs}</span>
        <Select value={asUser} onChange={(event) => setAsUser(event.target.value)} aria-label={COPY.sampleAs} className="min-w-[12rem]">
          {context.people.map((person) => (
            <option key={person.id} value={person.id}>
              {`${person.nameTh} · ${TH.roleShort[person.role]}`}
            </option>
          ))}
        </Select>
        <button type="button" className={GHOST} onClick={sample} disabled={pending || !context.writable}>
          {pending ? COPY.fieldsLoading : COPY.fieldsFromSample}
        </button>
      </div>
      {problem ? <ProblemLine text={problem} /> : null}
    </div>
  );
}

function ScopeCard({ tool, context }: { tool: WizardTool; context: WizardContext }) {
  const patch = (next: DraftPatch) => context.patchDraft(tool.name, next);
  return (
    <li className="flex flex-col gap-5 rounded-3xl border border-border bg-card p-5 shadow-card">
      <header>
        <h3 className="text-[15px] font-semibold">{tool.draft.labelTh || tool.name}</h3>
        <p className="font-mono text-[11px] text-muted-foreground">{tool.name}</p>
      </header>
      {tool.draft.tier === "read" ? (
        <>
          <FieldSampler tool={tool} context={context} />
          <ScopeChoice tool={tool} fields={tool.fields} patch={patch} />
          {tool.fields.length > 0 ? <SensitiveFields tool={tool} fields={tool.fields} patch={patch} /> : null}
        </>
      ) : (
        <WriteRules tool={tool} context={context} />
      )}
    </li>
  );
}

export function ScopeStep({ context }: { context: WizardContext }) {
  const tools = context.tools.filter((tool) => tool.include && tool.listed);
  return (
    <Panel title={TH.connectorUi.steps.scope} hint={COPY.hint}>
      {tools.length === 0 ? (
        <EmptyLine text={TH.connectorUi.roles.empty} />
      ) : (
        <ul className="flex flex-col gap-4">
          {tools.map((tool) => (
            <ScopeCard key={tool.name} tool={tool} context={context} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
