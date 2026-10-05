"use client";

import { startTransition, useActionState, useState, type FormEvent } from "react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import type { RuleFormState } from "@/app/(app)/admin/actions";
import { FIELD, FOCUS, GHOST, INK } from "./parts";

const COPY = TH.admin.rulesTab;
const EXPRESSION_ROWS = 3;

type RuleAction = (previous: RuleFormState, formData: FormData) => Promise<RuleFormState>;

type RuleFormProps = { action: RuleAction; ruleId?: string; initialName?: string; initialWhen?: string; submitLabel: string; clearOnSave?: boolean; showExamples?: boolean };

/** The name and CEL expression of one rule, saved through a server action that refuses an invalid expression and says why next to the form. */
export function RuleForm({ action, ruleId, initialName = "", initialWhen = "", submitLabel, clearOnSave = false, showExamples = false }: RuleFormProps) {
  const [name, setName] = useState(initialName);
  const [when, setWhen] = useState(initialWhen);
  const [state, dispatch, pending] = useActionState(async (previous: RuleFormState, formData: FormData) => {
    const result = await action(previous, formData);
    if (result?.ok && clearOnSave) {
      setName("");
      setWhen("");
    }
    return result;
  }, null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => dispatch(formData));
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={submit} className="flex flex-col gap-2.5">
        {ruleId ? <input type="hidden" name="rule" value={ruleId} /> : null}
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {COPY.name}
          <input name="name" value={name} onChange={(event) => setName(event.target.value)} placeholder={COPY.namePlaceholder} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {COPY.expression}
          <textarea
            name="when"
            value={when}
            onChange={(event) => setWhen(event.target.value)}
            rows={EXPRESSION_ROWS}
            spellCheck={false}
            aria-invalid={state?.ok === false}
            className={cn("rounded-2xl border bg-card px-3.5 py-2.5 font-mono text-[13px] text-foreground shadow-card", FOCUS, state?.ok === false ? "border-danger" : "border-border")}
          />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={pending} className={cn(INK, "disabled:opacity-60")}>
            {pending ? COPY.saving : submitLabel}
          </button>
          {state?.ok ? <span className="text-xs text-success">{COPY.saved}</span> : null}
        </div>
        {state && !state.ok ? (
          <div role="alert" className="rounded-2xl border border-danger/30 bg-danger/5 px-3.5 py-2.5">
            <p className="text-sm text-danger">{state.error}</p>
            {state.detail ? <pre className="mt-1.5 overflow-x-auto whitespace-pre font-mono text-[11px] leading-relaxed text-muted-foreground">{state.detail}</pre> : null}
          </div>
        ) : null}
      </form>
      {showExamples ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted-foreground">{COPY.examplesTitle}</p>
          {COPY.examples.map((example) => (
            <div key={example.name} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{example.name}</p>
                <code className="mt-0.5 block break-all font-mono text-[12px] text-muted-foreground">{example.when}</code>
              </div>
              <button
                type="button"
                onClick={() => {
                  setName(example.name);
                  setWhen(example.when);
                }}
                className={cn(GHOST, "h-8 text-xs")}
              >
                {COPY.useExample}
              </button>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
