"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plug, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FIELD, FOCUS, INK, Panel, Pill } from "@/components/admin/parts";
import { TH } from "@/lib/i18n/th";
import { discoverAction, type ProblemCode } from "./actions";
import { toolDraftOf, type AuthKind } from "./model";
import { cleanedDescription, Label } from "./parts";
import type { WizardData } from "./wizard";

const COPY = TH.connectorUi.connect;

export type Example = { key: "lms" | "asset" | "requisition" | "leave"; id: string; labelTh: string; url: string; auth: AuthKind; secret: string };

const EXAMPLE_LABEL: Record<Example["key"], string> = { lms: COPY.exampleLms, asset: COPY.exampleAsset, requisition: COPY.exampleRequisition, leave: COPY.exampleLeave };

const AUTH: readonly { id: AuthKind; label: string; hint: string }[] = [
  { id: "signed_identity", label: COPY.signed, hint: COPY.signedHint },
  { id: "bearer", label: COPY.bearer, hint: COPY.bearerHint },
];

type Props = { data: WizardData; setData: React.Dispatch<React.SetStateAction<WizardData>>; examples: Example[]; onDone: () => void };

export function ConnectStep({ data, setData, examples, onDone }: Props) {
  const [secret, setSecret] = useState("");
  const [problem, setProblem] = useState<{ code: ProblemCode; detail?: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const connector = data.connector;
  const set = (patch: Partial<WizardData["connector"]>) => setData((current) => ({ ...current, connector: { ...current.connector, ...patch } }));

  const pickExample = (example: Example) => {
    setProblem(null);
    setSecret(example.secret);
    setData((current) => ({ ...current, remote: [], tools: [], enabled: null, connector: { id: example.id, labelTh: example.labelTh, url: example.url, auth: example.auth, secretHint: null, draftKey: null, fixture: false } }));
  };

  const discover = () =>
    startTransition(async () => {
      setProblem(null);
      const result = await discoverAction({ url: connector.url, auth: connector.auth, secret });
      if (!result.ok) {
        setProblem({ code: result.problem, detail: result.detail });
        return;
      }
      setSecret("");
      setData((current) => ({
        ...current,
        enabled: null,
        remote: result.tools,
        tools: result.tools.map((tool) => ({ ...toolDraftOf(tool), description: cleanedDescription(tool.description) })),
        connector: { ...current.connector, secretHint: result.secretHint, draftKey: result.draftKey, fixture: result.fixture },
      }));
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
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <Label>{COPY.label}</Label>
              <input className={FIELD} value={connector.labelTh} onChange={(event) => set({ labelTh: event.target.value })} placeholder={COPY.exampleAsset} />
            </label>
            <label className="flex flex-col gap-1.5">
              <Label>{COPY.id}</Label>
              <input className={cn(FIELD, "font-mono")} value={connector.id} onChange={(event) => set({ id: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 32) })} placeholder="asset" />
              <span className="px-1 text-[11px] text-muted-foreground">{COPY.idHint}</span>
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <Label>{COPY.url}</Label>
            <input className={cn(FIELD, "font-mono")} value={connector.url} onChange={(event) => set({ url: event.target.value, draftKey: null, secretHint: null })} placeholder="https://asset-mcp.boonrawd.internal/mcp" />
            <span className="px-1 text-[11px] text-muted-foreground">{COPY.urlHint}</span>
          </label>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1.5 text-[13px] font-medium">{COPY.auth}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {AUTH.map((option) => (
                <label key={option.id} className={cn("flex cursor-pointer gap-2.5 rounded-2xl border p-3 transition", connector.auth === option.id ? "border-foreground/40 bg-card shadow-card" : "border-border bg-muted/30 hover:border-foreground/20")}>
                  <input type="radio" name="auth" checked={connector.auth === option.id} onChange={() => set({ auth: option.id })} className="mt-1 accent-[var(--color-ink)]" />
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
                placeholder={connector.secretHint ? `••••••••${connector.secretHint}` : ""}
              />
            </span>
            <span className="px-1 text-[11px] text-muted-foreground">{COPY.secretHint}</span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" className={INK} disabled={pending}>
              <Plug className="size-4" aria-hidden />
              {pending ? COPY.discovering : COPY.discover}
            </button>
            {connector.draftKey && connector.secretHint ? (
              <p className="flex flex-wrap items-center gap-2 text-[13px] text-success" role="status">
                <ShieldCheck className="size-4" aria-hidden />
                {COPY.found(data.remote.length, connector.secretHint)}
                <Pill tone={connector.fixture ? "warning" : "success"} title={connector.fixture ? COPY.fixtureHint : undefined}>
                  {connector.fixture ? COPY.fixture : COPY.live}
                </Pill>
              </p>
            ) : null}
          </div>
          {problem ? (
            <p role="alert" className="rounded-2xl bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger">
              {COPY.problems[problem.code]}
              {problem.detail ? <span className="mt-0.5 block font-mono text-[11px] opacity-80">{problem.detail}</span> : null}
            </p>
          ) : null}
          {connector.draftKey ? (
            <button type="button" className={cn("self-start text-[13px] font-medium underline underline-offset-4", FOCUS)} onClick={onDone}>
              {TH.connectorUi.steps.tools}
            </button>
          ) : null}
        </form>
      </Panel>
      <Panel title={COPY.examples}>
        <ul className="flex flex-col gap-2">
          {examples.map((example) => (
            <li key={example.key}>
              <button
                type="button"
                onClick={() => pickExample(example)}
                className={cn("flex w-full flex-col items-start gap-0.5 rounded-2xl border border-border bg-card px-3.5 py-2.5 text-left transition hover:border-foreground/25", FOCUS, connector.url === example.url ? "border-foreground/40" : "")}
              >
                <span className="text-[13px] font-medium">{EXAMPLE_LABEL[example.key]}</span>
                <span className="w-full truncate font-mono text-[11px] text-muted-foreground">{example.url}</span>
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
