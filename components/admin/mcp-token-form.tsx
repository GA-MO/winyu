"use client";

import { useActionState, useState } from "react";
import { Check, Copy, KeyRound } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import type { McpTokenFormState } from "@/app/(app)/admin/actions";
import { FIELD, FOCUS, INK, Select } from "./parts";

const COPY = TH.admin.mcpTab;
const COPIED_MS = 1500;

type Option = { id: string; label: string };

type Channel = "mcp" | "a2a";

const CHANNELS: readonly Channel[] = ["mcp", "a2a"];

type McpTokenFormProps = { action: (previous: McpTokenFormState, formData: FormData) => Promise<McpTokenFormState>; users: readonly Option[]; endpoint: string; cardUrl: string };

function claudeCommand(endpoint: string, token: string): string {
  return `claude mcp add --transport http winyu ${endpoint} --header "Authorization: Bearer ${token}"`;
}

function a2aEndpointOf(cardUrl: string): string {
  return new URL("/api/a2a", cardUrl).toString();
}

function curlCommand(cardUrl: string, token: string): string {
  const body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message: { kind: "message", role: "user", messageId: "m1", parts: [{ kind: "text", text: "ยอดขายเข้าแยกตามภาคไตรมาสนี้" }] } } });
  return `curl -s ${a2aEndpointOf(cardUrl)} -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${body}'`;
}

function IssuedLines({ channel, token, endpoint, cardUrl }: { channel: Channel; token: string; endpoint: string; cardUrl: string }) {
  if (channel === "a2a") {
    return (
      <>
        <CopyLine label={COPY.agentCard} value={cardUrl} />
        <CopyLine label={COPY.token} value={token} />
        <CopyLine label={COPY.curl} value={curlCommand(cardUrl, token)} />
      </>
    );
  }
  return (
    <>
      <CopyLine label={COPY.endpoint} value={endpoint} />
      <CopyLine label={COPY.token} value={token} />
      <CopyLine label={COPY.claudeCode} value={claudeCommand(endpoint, token)} />
    </>
  );
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

/** Picks a user and a channel and issues a token in their name: for MCP the endpoint and a ready Claude Code command, for A2A the agent card and a ready curl call, shown once, right here. */
export function McpTokenForm({ action, users, endpoint, cardUrl }: McpTokenFormProps) {
  const [state, dispatch, pending] = useActionState(action, null);
  const [channel, setChannel] = useState<Channel>("mcp");
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
        <label className="flex min-w-[12rem] flex-col gap-1 text-xs text-muted-foreground">
          {COPY.channel}
          <Select name="channel" value={channel} onChange={(event) => setChannel(event.target.value === "a2a" ? "a2a" : "mcp")}>
            {CHANNELS.map((option) => (
              <option key={option} value={option}>
                {COPY.channels[option]}
              </option>
            ))}
          </Select>
        </label>
        {channel === "a2a" ? (
          <label className="flex min-w-[14rem] flex-1 flex-col gap-1 text-xs text-muted-foreground sm:max-w-xs">
            {COPY.caller}
            <input name="caller" required maxLength={80} placeholder={COPY.callerPlaceholder} className={FIELD} />
          </label>
        ) : null}
        <button type="submit" disabled={pending} className={cn(INK, "disabled:opacity-60")}>
          <KeyRound className="size-4" aria-hidden />
          {pending ? COPY.issuing : COPY.issue}
        </button>
      </form>
      {state && !state.ok ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      {state?.ok && issuedTo ? (
        <div role="status" className="flex flex-col gap-2.5 rounded-2xl border border-success/30 bg-success/5 px-4 py-3">
          <p className="text-sm text-foreground">{COPY.issued(issuedTo)}</p>
          <IssuedLines channel={state.channel} token={state.token} endpoint={endpoint} cardUrl={cardUrl} />
        </div>
      ) : null}
    </div>
  );
}
