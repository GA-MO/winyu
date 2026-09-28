"use client";

import { useState, type FormEvent } from "react";
import { useVexaHostContext } from "vexa/react";
import { TH } from "@/lib/i18n/th";

export type LeaveKindOption = { value: string; label: string };

export type LeaveFormProps = {
  kinds: LeaveKindOption[];
  earliest: string | null;
  approver: string | null;
  note: string | null;
  kind?: string | null;
  from?: string | null;
  to?: string | null;
  reason?: string | null;
};

type LeaveDraft = { kind: string; from: string; to: string; reason: string; sentKey: string | null };

const ACTION_TOOL = "winyu_action";
const DRAFTS = new Map<string, LeaveDraft>();
const FIELD =
  "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const PRIMARY =
  "inline-flex items-center justify-center rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-foreground transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50";

function usePress(key: string, label: string, tool: string, input: Record<string, unknown>) {
  const host = useVexaHostContext();
  if (!host) return null;
  const action = { id: `press-${key}`, kind: "tool", label, reason: label, tool, input, prompt: null };
  return () => void host.runTool(ACTION_TOOL, action, { source: "button", toolCallId: `${ACTION_TOOL}-press-${key}` });
}

function kindLabel(kinds: LeaveKindOption[], value: string): string {
  const label = kinds.find((kind) => kind.value === value)?.label ?? value;
  return label.replace(/\s*\(.*\)$/, "");
}

function draftKeyOf(props: LeaveFormProps): string {
  return JSON.stringify([props.kinds, props.earliest, props.approver, props.kind, props.from, props.to, props.reason]);
}

function initialDraft(props: LeaveFormProps, kinds: LeaveKindOption[]): LeaveDraft {
  const kind = kinds.some((option) => option.value === props.kind) ? (props.kind as string) : (kinds[0]?.value ?? "annual");
  const from = props.from ?? props.earliest ?? "";
  return { kind, from, to: props.to ?? from, reason: props.reason ?? "", sentKey: null };
}

function useLeaveDraft(props: LeaveFormProps, kinds: LeaveKindOption[]) {
  const key = draftKeyOf(props);
  const [draft, setDraft] = useState<LeaveDraft>(() => DRAFTS.get(key) ?? initialDraft(props, kinds));
  const update = (patch: Partial<LeaveDraft>) =>
    setDraft((current) => {
      const next = { ...current, ...patch };
      DRAFTS.set(key, next);
      return next;
    });
  return [draft, update] as const;
}

/** The leave form: kind, dates and reason. Submitting asks Winyu to file it, which then asks the user to approve. */
export function LeaveForm({ props }: { props: LeaveFormProps }) {
  const kinds = props.kinds ?? [];
  const [draft, update] = useLeaveDraft(props, kinds);
  const { kind, from, to, reason, sentKey } = draft;
  const label = TH.leave.form.prompt(kindLabel(kinds, kind), from, to);
  const requestKey = `leave-${kind}-${from}-${to}-${reason.trim()}`;
  const submit = usePress(requestKey, label, "request_leave", { kind, from, to, reason: reason.trim() });
  const sent = sentKey === requestKey;
  const ready = Boolean(submit) && from.length > 0 && to.length > 0 && to >= from && !sent;
  const T = TH.leave.form;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !submit) return;
    submit();
    update({ sentKey: requestKey });
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {T.kind}
        <select value={kind} onChange={(event) => update({ kind: event.target.value })} className={FIELD}>
          {kinds.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-1 gap-3 @md/vexa:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {T.from}
          <input type="date" value={from} onChange={(event) => update({ from: event.target.value })} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          {T.to}
          <input type="date" value={to} min={from || undefined} onChange={(event) => update({ to: event.target.value })} className={FIELD} />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        {T.reason}
        <textarea value={reason} rows={2} maxLength={200} placeholder={T.reasonPlaceholder} onChange={(event) => update({ reason: event.target.value })} className={FIELD} />
      </label>
      {props.note ? <p className="text-[11px] text-muted-foreground">{props.note}</p> : null}
      <button type="submit" disabled={!ready} className={`${PRIMARY} self-start`}>
        {sent ? T.sent : T.submit}
      </button>
    </form>
  );
}
