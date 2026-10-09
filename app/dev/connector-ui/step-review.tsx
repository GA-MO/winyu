"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, FlaskConical, Power } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { EmptyLine, GHOST, INK, Panel, Pill, Select } from "@/components/admin/parts";
import { ROLE_IDS, type RoleId } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { testToolAction, type ProblemCode } from "./actions";
import { isWrite, promptTokensFor, rolesTouched, toolHash, visibilityOf, type Blocker, type TestRecord, type ToolDraft } from "./model";
import { scopeCell, type Person } from "./parts";
import type { ToolPatch, WizardData } from "./wizard";

const COPY = TH.connectorUi.review;

function defaultTester(tool: ToolDraft, people: Person[]): string {
  const eligible = people.filter((person) => tool.roles.includes(person.role));
  return (eligible.find((person) => person.scopeTh !== TH.region.all) ?? eligible[0] ?? people[0])?.id ?? "";
}

function compactJson(value: Record<string, unknown> | null): string {
  return value ? JSON.stringify(value) : "";
}

function TestOutcome({ test, write }: { test: TestRecord; write: boolean }) {
  if (write) {
    return (
      <div className="flex flex-col gap-1.5 text-[12px]">
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">{COPY.sent}</span>
          <code className="min-w-0 break-all font-mono text-foreground/85">{compactJson(test.sentArgs)}</code>
        </p>
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">{COPY.audited}</span>
          <code className="min-w-0 break-all font-mono text-foreground/85">{compactJson(test.auditArgs)}</code>
        </p>
        {test.guarded === null ? null : <p className={test.guarded ? "text-success" : "font-medium text-danger"}>{test.guarded ? COPY.guardPassed : COPY.guardRefused}</p>}
        {test.verified === null ? null : <p className={test.verified ? "text-success" : "text-danger"}>{test.verified ? COPY.verified : COPY.notVerified}</p>}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1 text-[12px]">
      <p className="text-[13px] font-medium tabular-nums">{COPY.readResult(test.received, test.kept)}</p>
      {test.missingField > 0 ? <p className="text-muted-foreground">{COPY.missing(test.missingField)}</p> : null}
      {test.masked.length > 0 ? <p className="text-muted-foreground">{COPY.maskedFields(test.masked.join(", "))}</p> : null}
      {test.sentArgs ? (
        <p className="flex flex-wrap items-baseline gap-2">
          <span className="text-muted-foreground">{COPY.sent}</span>
          <code className="min-w-0 break-all font-mono text-foreground/85">{compactJson(test.sentArgs)}</code>
        </p>
      ) : null}
    </div>
  );
}

function TestRow({ tool, data, people, patch }: { tool: ToolDraft; data: WizardData; people: Person[]; patch: (next: ToolPatch) => void }) {
  const [asUser, setAsUser] = useState(() => defaultTester(tool, people));
  const [problem, setProblem] = useState<ProblemCode | null>(null);
  const [pending, startTransition] = useTransition();
  const remote = data.remote.find((item) => item.name === tool.name);
  const status = !tool.test ? "untested" : tool.test.hash === toolHash(tool) ? "tested" : "stale";
  const run = () =>
    startTransition(async () => {
      if (!remote) return;
      setProblem(null);
      const guardTool = data.tools.find((item) => item.name === tool.write.guard?.readTool);
      const guardRemote = data.remote.find((item) => item.name === tool.write.guard?.readTool);
      const guard = isWrite(tool) && guardTool && guardRemote ? { tool: guardTool, remote: guardRemote } : null;
      const result = await testToolAction({ draftKey: data.connector.draftKey ?? "", tool, remote, asUser, guard });
      if (!result.ok) {
        setProblem(result.problem);
        return;
      }
      patch((current) => ({ ...current, test: result.test }));
    });
  return (
    <li className="grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        <p className="text-[14px] font-medium">{tool.labelTh || tool.name}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{tool.name}</p>
        <span>
          <Pill tone={status === "tested" ? "success" : status === "stale" ? "warning" : "neutral"}>{COPY[status]}</Pill>
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">{COPY.asUser}</span>
          <Select value={asUser} onChange={(event) => setAsUser(event.target.value)} aria-label={COPY.asUser} className="min-w-[14rem]">
            {ROLE_IDS.map((role) => (
              <optgroup key={role} label={TH.role[role]}>
                {people.filter((person) => person.role === role).map((person) => (
                  <option key={person.id} value={person.id}>
                    {`${person.nameTh} · ${person.scopeTh}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <button type="button" className={GHOST} onClick={run} disabled={pending}>
            <FlaskConical className="size-4" aria-hidden />
            {pending ? COPY.running : COPY.run}
          </button>
        </div>
        {problem ? <p className="text-[12px] text-danger">{TH.connectorUi.connect.problems[problem]}</p> : null}
        {tool.test ? <TestOutcome test={tool.test} write={isWrite(tool)} /> : null}
      </div>
    </li>
  );
}

function cellOf(tool: ToolDraft, role: RoleId): { text: string; hidden: string[] } | null {
  if (!tool.roles.includes(role)) return null;
  const hidden = tool.sensitive.filter((item) => visibilityOf(item, role) !== "full").map((item) => (visibilityOf(item, role) === "masked" ? `*** ${item.field}` : item.field));
  return { text: `${scopeCell(tool.scope)}${isWrite(tool) ? ` · ${COPY.asks}` : ""}`, hidden };
}

function RoleMatrix({ tools }: { tools: ToolDraft[] }) {
  return (
    <table className="w-full min-w-[640px] border-collapse text-[12px]">
      <thead>
        <tr className="text-left text-[11px] text-muted-foreground">
          <th className="py-2 pr-3 font-medium" />
          {tools.map((tool) => (
            <th key={tool.name} className="px-2 py-2 font-medium">
              {tool.labelTh || tool.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {ROLE_IDS.map((role) => (
          <tr key={role} className="border-t border-border align-top">
            <th scope="row" className="py-2 pr-3 text-left text-[13px] font-medium">
              {TH.role[role]}
            </th>
            {tools.map((tool) => {
              const cell = cellOf(tool, role);
              return (
                <td key={tool.name} className="px-2 py-2">
                  {cell ? (
                    <span className="flex flex-col gap-0.5">
                      <span className={cn(tool.scope.kind === "unset" ? "text-danger" : "text-foreground")}>{cell.text}</span>
                      {cell.hidden.length > 0 ? <span className="text-muted-foreground">{TH.connectorUi.review.maskedFields(cell.hidden.join(", "))}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/50">–</span>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function BlockerList({ blockers, tools }: { blockers: Blocker[]; tools: ToolDraft[] }) {
  const byTool = tools.map((tool) => ({ tool, codes: blockers.filter((blocker) => blocker.tool === tool.name).map((blocker) => blocker.code) })).filter((group) => group.codes.length > 0);
  return (
    <ul className="flex flex-col gap-2">
      {byTool.map((group) => (
        <li key={group.tool.name} className="text-[13px]">
          <span className="font-medium">{group.tool.labelTh || group.tool.name}</span>
          <span className="text-muted-foreground">{` · ${group.codes.map((code) => COPY.blockers[code]).join(" · ")}`}</span>
        </li>
      ))}
    </ul>
  );
}

type Props = { data: WizardData; tools: ToolDraft[]; blockers: Blocker[]; patchTool: (name: string, patch: ToolPatch) => void; people: Person[]; onActivate: () => void };

export function ReviewStep({ data, tools, blockers, patchTool, people, onActivate }: Props) {
  if (tools.length === 0) {
    return (
      <Panel title={TH.connectorUi.steps.review}>
        <EmptyLine text={COPY.noTools} />
      </Panel>
    );
  }
  const roles = rolesTouched(tools);
  const tokens = Math.max(0, ...roles.map((role) => promptTokensFor(role, tools, data.remote)));
  const blocked = blockers.length > 0;
  return (
    <div className="flex flex-col gap-4">
      <Panel title={COPY.testTitle} hint={COPY.testHint}>
        <ul className="flex flex-col">
          {tools.map((tool) => (
            <TestRow key={tool.name} tool={tool} data={data} people={people} patch={(patch) => patchTool(tool.name, patch)} />
          ))}
        </ul>
      </Panel>
      <Panel title={COPY.matrixTitle} hint={COPY.matrixHint} bodyClassName="overflow-x-auto">
        <RoleMatrix tools={tools} />
      </Panel>
      <Panel>
        <div className="flex flex-col gap-4">
          {blocked ? (
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                {COPY.blockersTitle}
              </h3>
              <BlockerList blockers={blockers} tools={tools} />
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5 rounded-2xl bg-warning/10 px-4 py-3">
            <p className="text-[13px] font-medium">{COPY.evalTitle}</p>
            <p className="text-[13px] leading-relaxed">{COPY.evalBody(tools.length, roles.length, tokens)}</p>
            <p className="text-[12px] text-muted-foreground">
              <code className="mr-1.5 rounded-md bg-card px-1.5 py-0.5 font-mono text-foreground">{COPY.evalCommand}</code>
              {COPY.evalAfter}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={cn(INK, "disabled:cursor-not-allowed disabled:opacity-40")} disabled={blocked} onClick={onActivate}>
              <Power className="size-4" aria-hidden />
              {COPY.activate}
            </button>
            <span className="text-[12px] text-muted-foreground">{blocked ? COPY.activateBlocked(blockers.length) : COPY.startsOff}</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
