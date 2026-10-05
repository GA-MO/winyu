"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import type { McpTokenFormState } from "@/app/(app)/admin/actions";
import { FOCUS, INK, Select } from "./parts";

const COPY = TH.admin.mcpTab;
const COPIED_MS = 1500;

type Option = { id: string; label: string };

type McpTokenFormProps = { action: (previous: McpTokenFormState, formData: FormData) => Promise<McpTokenFormState>; users: readonly Option[]; endpoint: string };

function claudeCommand(endpoint: string, token: string): string {
  return `claude mcp add --transport http mascop ${endpoint} --header "Authorization: Bearer ${token}"`;
}

function CopyLine({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), COPIED_MS);
  }
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <div className="flex items-start gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-muted/60 px-2.5 py-1.5 font-mono text-[12px] text-foreground">{value}</code>
        <button type="button" onClick={copy} aria-label={`${label}: ${copied ? COPY.copied : COPY.copy}`} className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-card transition hover:text-foreground", FOCUS)}>
          {copied ? <Check className="size-3.5 text-success" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/** Picks a user and issues them an MCP token; the plain token, the endpoint and a ready Claude Code command show once, right here. */
export function McpTokenForm({ action, users, endpoint }: McpTokenFormProps) {
  const [state, dispatch, pending] = useActionState(action, null);
  const issuedTo = state?.ok ? users.find((user) => user.id === state.userId)?.label ?? state.userId : null;
  return (
    <div className="flex flex-col gap-3">
      <form action={dispatch} className="flex flex-wrap items-end gap-2.5">
        <label className="flex min-w-[16rem] flex-1 flex-col gap-1 text-xs text-muted-foreground sm:max-w-sm">
          {COPY.user}
          <Select name="user" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.label}
              </option>
            ))}
          </Select>
        </label>
        <button type="submit" disabled={pending} className={cn(INK, "disabled:opacity-60")}>
          <KeyRound className="size-4" aria-hidden />
          {pending ? COPY.issuing : COPY.issue}
        </button>
      </form>
      {state && !state.ok ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      {state?.ok && issuedTo ? (
        <div role="status" className="flex flex-col gap-2.5 rounded-2xl border border-success/30 bg-success/5 px-4 py-3">
          <p className="text-sm text-foreground">{COPY.issued(issuedTo)}</p>
          <CopyLine label={COPY.endpoint} value={endpoint} />
          <CopyLine label={COPY.token} value={state.token} />
          <CopyLine label={COPY.claudeCode} value={claudeCommand(endpoint, state.token)} />
        </div>
      ) : null}
    </div>
  );
}
