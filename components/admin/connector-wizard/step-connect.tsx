"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FIELD, INK, Panel } from "@/components/admin/parts";
import { TH } from "@/lib/i18n/th";
import { discoverConnectorAction } from "@/app/(app)/admin/actions";
import type { AuthKind, ConnectorView, Problem } from "@/lib/connectors/spec";
import { Label, ProblemLine } from "./parts";
import type { Settings } from "./wizard";

const COPY = TH.connectorUi.connect;
const ID_CHARS = /[^a-z0-9_]/g;
const MAX_ID = 32;

const AUTH: readonly { id: AuthKind; label: string; hint: string }[] = [
  { id: "signed_identity", label: COPY.signed, hint: COPY.signedHint },
  { id: "bearer", label: COPY.bearer, hint: COPY.bearerHint },
];

type Props = { view: ConnectorView | null; settings: Settings; onConnected: (view: ConnectorView) => void };

function Hosts({ hosts }: { hosts: string[] }) {
  return (
    <Panel title={COPY.hosts} hint={COPY.hostsHint}>
      {hosts.length === 0 ? (
        <p className="text-[13px] text-warning">{COPY.hostsEmpty}</p>
      ) : (
        <ul className="flex flex-wrap gap-1.5">
          {hosts.map((host) => (
            <li key={host} className="rounded-full border border-border bg-muted/40 px-2.5 py-1 font-mono text-[12px]">
              {host}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export function ConnectStep({ view, settings, onConnected }: Props) {
  const stored = view?.connector ?? null;
  const [labelTh, setLabel] = useState(stored?.labelTh ?? "");
  const [id, setId] = useState(stored?.id ?? "");
  const [url, setUrl] = useState(stored?.url ?? "");
  const [auth, setAuth] = useState<AuthKind>(stored?.auth.kind ?? "signed_identity");
  const [secret, setSecret] = useState("");
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, startTransition] = useTransition();
  const sameTarget = stored !== null && stored.url === url.trim() && stored.auth.kind === auth;

  const discover = () =>
    startTransition(async () => {
      setProblem(null);
      const result = await discoverConnectorAction({ existing: stored !== null, id, labelTh, url, auth, secret });
      setSecret("");
      if (!result.ok) {
        setProblem(result);
        return;
      }
      onConnected(result.view);
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Panel title={TH.connectorUi.steps.connect}>
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            discover();
          }}
        >
          <fieldset disabled={!settings.writable} className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <Label>{COPY.label}</Label>
                <input className={FIELD} value={labelTh} onChange={(event) => setLabel(event.target.value)} placeholder={COPY.labelPlaceholder} />
              </label>
              <label className="flex flex-col gap-1.5">
                <Label>{COPY.id}</Label>
                <input className={cn(FIELD, "font-mono disabled:opacity-60")} value={id} disabled={stored !== null} onChange={(event) => setId(event.target.value.toLowerCase().replace(ID_CHARS, "").slice(0, MAX_ID))} placeholder="asset" />
                <span className="px-1 text-[11px] text-muted-foreground">{COPY.idHint}</span>
              </label>
            </div>
            <label className="flex flex-col gap-1.5">
              <Label>{COPY.url}</Label>
              <input className={cn(FIELD, "font-mono")} value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://asset-mcp.boonrawd.internal/mcp" />
              <span className="px-1 text-[11px] text-muted-foreground">{COPY.urlHint}</span>
            </label>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-[13px] font-medium">{COPY.auth}</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {AUTH.map((option) => (
                  <label key={option.id} className={cn("flex cursor-pointer gap-2.5 rounded-2xl border p-3 transition", auth === option.id ? "border-foreground/40 bg-card shadow-card" : "border-border bg-muted/30 hover:border-foreground/20")}>
                    <input type="radio" name="auth" checked={auth === option.id} onChange={() => setAuth(option.id)} className="mt-1 accent-[var(--color-ink)]" />
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-medium">{option.label}</span>
                      <span className="text-[12px] leading-relaxed text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="flex flex-col gap-1.5">
              <Label>{COPY.secret}</Label>
              <span className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                <input
                  type="password"
                  autoComplete="off"
                  className={cn(FIELD, "w-full pl-10 font-mono")}
                  value={secret}
                  onChange={(event) => setSecret(event.target.value)}
                  placeholder={stored && sameTarget ? COPY.secretKeep(stored.auth.secretHint) : ""}
                />
              </span>
              <span className="px-1 text-[11px] text-muted-foreground">{COPY.secretHint}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className={cn(INK, "disabled:cursor-not-allowed disabled:opacity-40")} disabled={pending}>
                <Plug className="size-4" aria-hidden />
                {pending ? COPY.discovering : stored ? COPY.rediscover : COPY.discover}
              </button>
              {view ? (
                <p className="flex flex-wrap items-center gap-2 text-[13px] text-success" role="status">
                  <ShieldCheck className="size-4" aria-hidden />
                  {COPY.found(view.upstream?.tools.length ?? 0, view.connector.auth.secretHint)}
                </p>
              ) : null}
            </div>
          </fieldset>
          {problem ? <ProblemLine text={TH.connectorUi.problems[problem.problem]} detail={problem.detail} /> : null}
        </form>
      </Panel>
      <Hosts hosts={settings.hosts} />
    </div>
  );
}
