"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CircleCheck, FlaskConical, Power } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { EmptyLine, GHOST, INK, Panel, Pill, Select } from "@/components/admin/parts";
import { ROLE_IDS, type RoleId } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { activateConnectorAction, testConnectorToolAction } from "@/app/(app)/admin/actions";
import type { BlockerCode, EvalImpact, Problem, TestRun } from "@/lib/connectors/spec";
import { blockersOfTool, defaultPersonFor, rolesTouched, testStatusOf, tokensOf, type WizardTool } from "./model";
import { ModelCheck } from "./model-check";
import { ProblemLine, scopeCell, type Person } from "./parts";
import type { WizardContext } from "./wizard";

const COPY = TH.connectorUi.review;
const STATUS_TONE = { tested: "success", stale: "warning", untested: "neutral" } as const;

function RunLine({ run, people }: { run: TestRun; people: readonly Person[] }) {
  const person = people.find((item) => item.id === run.asUser);
  return (
    <li className="flex flex-col gap-0.5 text-[12px]">
      <p className="text-[13px]">
        <span className="font-medium">{person ? `${person.nameTh} · ${TH.roleShort[person.role]}` : run.asUser}</span>
        <span className="tabular-nums text-muted-foreground">{` · ${run.dryRun ? COPY.dryRun : COPY.readResult(run.received, run.kept)}`}</span>
      </p>
      {run.dryRun && run.received > 0 ? <p className="tabular-nums text-muted-foreground">{COPY.guardResult(run.received, run.kept)}</p> : null}
      {run.missingField > 0 ? <p className="text-warning">{COPY.missing(run.missingField)}</p> : null}
      {run.masked.length > 0 ? <p className="text-muted-foreground">{COPY.maskedFields(run.masked.join(", "))}</p> : null}
      {run.fields.length > 0 ? <p className="font-mono text-[11px] text-muted-foreground">{COPY.fieldsSeen(run.fields.join(", "))}</p> : null}
    </li>
  );
}

function TestRow({ tool, context }: { tool: WizardTool; context: WizardContext }) {
  const [asUser, setAsUser] = useState(() => defaultPersonFor(tool, context.people));
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, startTransition] = useTransition();
  const status = testStatusOf(context.view.connector, tool);
  const runs = status === "tested" ? (tool.stored?.test?.runs ?? []) : [];
  const run = () =>
    startTransition(async () => {
      setProblem(null);
      const saved = await context.saveTools([tool.name]);
      if (!saved.ok) return setProblem(saved);
      if (saved.incomplete[tool.name]) return setProblem({ ok: false, problem: "declaration", codes: saved.incomplete[tool.name] });
      const result = await testConnectorToolAction({ connector: context.view.connector.id, tool: tool.name, asUser });
      if (!result.ok) return setProblem(result);
      context.adopt(result.view);
    });
  return (
    <li className="grid gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
      <div className="flex flex-col gap-1.5">
        <p className="text-[14px] font-medium">{tool.draft.labelTh || tool.name}</p>
        <p className="font-mono text-[11px] text-muted-foreground">{tool.name}</p>
        <span>
          <Pill tone={STATUS_TONE[status]}>{COPY[status]}</Pill>
        </span>
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {tool.draft.tier === "read" ? null : <p className="text-[12px] text-muted-foreground">{COPY.writeTestHint}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">{COPY.asUser}</span>
          <Select value={asUser} onChange={(event) => setAsUser(event.target.value)} aria-label={COPY.asUser} className="min-w-[14rem]">
            {ROLE_IDS.filter((role) => tool.draft.roles.includes(role)).map((role) => (
              <optgroup key={role} label={TH.role[role]}>
                {context.people.filter((person) => person.role === role).map((person) => (
                  <option key={person.id} value={person.id}>
                    {`${person.nameTh} · ${person.scopeTh}`}
                  </option>
                ))}
              </optgroup>
            ))}
          </Select>
          <button type="button" className={GHOST} onClick={run} disabled={pending || !context.writable || !asUser}>
            <FlaskConical className="size-4" aria-hidden />
            {pending ? COPY.running : COPY.run}
          </button>
        </div>
        {problem ? (
          <ProblemLine
            text={problem.codes?.length ? `${TH.connectorUi.problems[problem.problem]}: ${problem.codes.map((code) => COPY.blockers[code]).join(" · ")}` : TH.connectorUi.problems[problem.problem]}
            detail={problem.detail}
          />
        ) : null}
        {runs.length > 0 ? <ul className="flex flex-col gap-2">{runs.map((item) => <RunLine key={item.asUser} run={item} people={context.people} />)}</ul> : null}
      </div>
    </li>
  );
}

function cellOf(tool: WizardTool, role: RoleId): { text: string; hidden: string[] } | null {
  if (!tool.draft.roles.includes(role)) return null;
  if (tool.draft.write) return { text: COPY.writeCell(tool.draft.write.pins.length, tool.draft.write.guards.length), hidden: [] };
  const hidden = tool.draft.sensitive.filter((item) => (item.byRole[role] ?? "none") !== "full").map((item) => (item.byRole[role] === "masked" ? `*** ${item.field}` : item.field));
  return { text: scopeCell(tool.draft.scope), hidden };
}

function RoleMatrix({ tools }: { tools: WizardTool[] }) {
  return (
    <table className="w-full min-w-[640px] border-collapse text-[12px]">
      <thead>
        <tr className="text-left text-[11px] text-muted-foreground">
          <th className="py-2 pr-3 font-medium" />
          {tools.map((tool) => (
            <th key={tool.name} className="px-2 py-2 font-medium">
              {tool.draft.labelTh || tool.name}
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
                      <span className={cn(tool.draft.scope.kind === "unset" && !tool.draft.write ? "text-danger" : "text-foreground")}>{cell.text}</span>
                      {cell.hidden.length > 0 ? <span className="text-muted-foreground">{COPY.maskedFields(cell.hidden.join(", "))}</span> : null}
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

function BlockerList({ groups }: { groups: { tool: WizardTool; codes: BlockerCode[] }[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {groups.map((group) => (
        <li key={group.tool.name} className="text-[13px]">
          <span className="font-medium">{group.tool.draft.labelTh || group.tool.name}</span>
          <span className="text-muted-foreground">{` · ${group.codes.map((code) => COPY.blockers[code]).join(" · ")}`}</span>
        </li>
      ))}
    </ul>
  );
}

function Activated({ impact }: { impact: EvalImpact }) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl bg-success/10 px-4 py-3">
      <p className="flex items-center gap-2 text-[14px] font-semibold">
        <CircleCheck className="size-4 text-success" aria-hidden />
        {COPY.activated}
      </p>
      <p className="text-[13px]">{COPY.evalBody(impact.tools, impact.roles.length, impact.tokens, impact.affectedRecordings)}</p>
      <Link href="/admin?tab=tools" className={cn(GHOST, "self-start")}>
        {COPY.toTools}
      </Link>
    </div>
  );
}

export function ReviewStep({ context }: { context: WizardContext }) {
  const [problem, setProblem] = useState<Problem | null>(null);
  const [activated, setActivated] = useState<EvalImpact | null>(null);
  const [pending, startTransition] = useTransition();
  const tools = context.tools.filter((tool) => tool.include);
  if (tools.length === 0) {
    return (
      <Panel title={TH.connectorUi.steps.review}>
        <EmptyLine text={COPY.noTools} />
      </Panel>
    );
  }
  const groups = tools.map((tool) => ({ tool, codes: blockersOfTool(context.view.connector, tool, context.tools) })).filter((group) => group.codes.length > 0);
  const blockers = groups.reduce((sum, group) => sum + group.codes.length, 0);
  const listed = tools.filter((tool) => tool.listed);
  const recordings = context.view.impact.affectedRecordings;
  const activate = () =>
    startTransition(async () => {
      setProblem(null);
      const saved = await context.saveTools(tools.map((tool) => tool.name));
      if (!saved.ok) return setProblem(saved);
      const result = await activateConnectorAction({ connector: context.view.connector.id });
      if (!result.ok) return setProblem(result);
      context.adopt(result.view);
      setActivated(result.impact);
    });
  const live = context.view.connector.activatedAt !== null;
  return (
    <div className="flex flex-col gap-4">
      <Panel title={COPY.testTitle} hint={COPY.testHint}>
        <ul className="flex flex-col">
          {listed.map((tool) => (
            <TestRow key={tool.name} tool={tool} context={context} />
          ))}
        </ul>
      </Panel>
      <ModelCheck context={context} />
      <Panel title={COPY.matrixTitle} hint={COPY.matrixHint} bodyClassName="overflow-x-auto">
        <RoleMatrix tools={listed} />
      </Panel>
      <Panel>
        <div className="flex flex-col gap-4">
          {groups.length > 0 ? (
            <div className="flex flex-col gap-2">
              <h3 className="flex items-center gap-2 text-[14px] font-semibold">
                <AlertTriangle className="size-4 text-warning" aria-hidden />
                {COPY.blockersTitle}
              </h3>
              <BlockerList groups={groups} />
            </div>
          ) : null}
          {activated ? (
            <Activated impact={activated} />
          ) : (
            <div className="flex flex-col gap-1.5 rounded-2xl bg-warning/10 px-4 py-3">
              <p className="text-[13px] font-medium">{COPY.evalTitle}</p>
              <p className="text-[13px] leading-relaxed">{COPY.evalBody(listed.length, rolesTouched(listed).length, tokensOf(listed), recordings)}</p>
              <p className="text-[12px] text-muted-foreground">
                <code className="mr-1.5 rounded-md bg-card px-1.5 py-0.5 font-mono text-foreground">{COPY.evalCommand}</code>
                {COPY.evalAfter}
              </p>
            </div>
          )}
          {problem ? (
            <ProblemLine text={problem.codes?.length ? `${TH.connectorUi.problems[problem.problem]}: ${problem.codes.map((code) => COPY.blockers[code]).join(" · ")}` : TH.connectorUi.problems[problem.problem]} detail={problem.detail} />
          ) : null}
          {live || activated ? null : (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className={cn(INK, "disabled:cursor-not-allowed disabled:opacity-40")} disabled={blockers > 0 || pending || !context.writable} onClick={activate}>
                <Power className="size-4" aria-hidden />
                {COPY.activate}
              </button>
              <span className="text-[12px] text-muted-foreground">{blockers > 0 ? COPY.activateBlocked(blockers) : COPY.startsOff}</span>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}
