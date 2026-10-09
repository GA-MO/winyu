"use client";

import { useState, useTransition } from "react";
import { Bot, CircleCheck, TriangleAlert } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { FOCUS, GHOST, Panel, Pill, Select } from "@/components/admin/parts";
import { TH } from "@/lib/i18n/th";
import { checkConnectorWithModelAction } from "@/app/(app)/admin/actions";
import { MAX_CHECK_QUESTIONS, type ModelCheckAnswer, type Problem } from "@/lib/connectors/spec";
import { Check, Label, ProblemLine } from "./parts";
import type { WizardContext } from "./wizard";

const COPY = TH.connectorUi.modelCheck;
const USD_DIGITS = 3;

function usd(value: number): string {
  return `$${value.toFixed(USD_DIGITS)}`;
}

function promptsOf(text: string): string[] {
  return text.split("\n").map((line) => line.trim()).filter(Boolean);
}

function ToolChips({ names, ours }: { names: readonly string[]; ours: readonly string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {names.map((name, index) => (
        <code key={`${name}-${index}`} className={cn("rounded-md px-1.5 py-0.5 font-mono text-[11px]", ours.includes(name) ? "bg-success/12 text-success" : "bg-muted text-foreground/80")}>
          {name}
        </code>
      ))}
    </span>
  );
}

function AnswerRow({ answer }: { answer: ModelCheckAnswer }) {
  const picked = answer.fromConnector.length > 0;
  return (
    <li className="flex flex-col gap-1.5 border-t border-border py-3 first:border-t-0 first:pt-0">
      <p className="text-[13px] font-medium">{answer.prompt}</p>
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <span className="text-muted-foreground">{COPY.tools}</span>
        {answer.tools.length > 0 ? <ToolChips names={answer.tools} ours={answer.fromConnector} /> : <span className="text-muted-foreground">{COPY.noTool}</span>}
      </div>
      {answer.asked.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-muted-foreground">{COPY.asked}</span>
          <ToolChips names={answer.asked} ours={answer.fromConnector} />
        </div>
      ) : null}
      <span className="flex flex-wrap gap-1.5">
        {answer.caseId === null ? <Pill tone={picked ? "success" : "neutral"}>{picked ? COPY.picked : COPY.notPicked}</Pill> : null}
        {answer.kept === true && answer.expected ? <Pill tone="success">{COPY.kept(answer.expected)}</Pill> : null}
        {answer.kept === false ? <Pill tone="warning">{COPY.changed(answer.expected ?? "–", answer.tools[0] ?? "–")}</Pill> : null}
      </span>
      {answer.error ? <p className="text-[12px] text-danger">{COPY.error(answer.error)}</p> : null}
    </li>
  );
}

/** The wizard's model check: a few real questions to the agent as one person with this connector's tested tools on the surface, the cost stated before anything is spent. */
export function ModelCheck({ context }: { context: WizardContext }) {
  const people = context.people.filter((person) => context.tools.some((tool) => tool.include && tool.draft.roles.includes(person.role)));
  const [asUser, setAsUser] = useState(() => people[0]?.id ?? "");
  const [text, setText] = useState("");
  const [cases, setCases] = useState<string[]>([]);
  const [answers, setAnswers] = useState<{ list: ModelCheckAnswer[]; usd: number } | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [pending, startTransition] = useTransition();
  const mine = context.checks.cases.filter((testCase) => testCase.userId === asUser);
  const chosen = cases.filter((id) => mine.some((testCase) => testCase.id === id));
  const count = promptsOf(text).length + chosen.length;
  const tooMany = count > MAX_CHECK_QUESTIONS;
  const run = () =>
    startTransition(async () => {
      setProblem(null);
      const result = await checkConnectorWithModelAction({ connector: context.view.connector.id, asUser, prompts: promptsOf(text), cases: chosen });
      if (!result.ok) return setProblem(result);
      setAnswers({ list: result.answers, usd: result.usd });
    });
  return (
    <Panel title={COPY.title} hint={COPY.hint}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] text-muted-foreground">{COPY.asUser}</span>
          <Select value={asUser} onChange={(event) => setAsUser(event.target.value)} aria-label={COPY.asUser} className="min-w-[14rem]">
            {people.map((person) => (
              <option key={person.id} value={person.id}>
                {`${person.nameTh} · ${TH.roleShort[person.role]}`}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex flex-col gap-1.5">
          <Label>{COPY.prompts}</Label>
          <textarea
            rows={3}
            value={text}
            placeholder={COPY.promptsPlaceholder}
            onChange={(event) => setText(event.target.value)}
            className={cn("rounded-2xl border border-border bg-card px-3.5 py-2.5 text-[13px] leading-relaxed shadow-card", FOCUS)}
          />
        </label>
        <div className="flex flex-col gap-2">
          <Label hint={COPY.casesHint}>{COPY.cases}</Label>
          {mine.length === 0 ? <p className="text-[12px] text-muted-foreground">{COPY.noCases}</p> : null}
          {mine.map((testCase) => (
            <Check key={testCase.id} checked={chosen.includes(testCase.id)} onChange={(on) => setCases((current) => (on ? [...current, testCase.id] : current.filter((id) => id !== testCase.id)))}>
              <span>{testCase.prompt}</span>
              {testCase.tool ? <code className="ml-1.5 rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">{testCase.tool}</code> : null}
            </Check>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={GHOST} onClick={run} disabled={pending || count === 0 || tooMany || !asUser}>
            <Bot className="size-4" aria-hidden />
            {pending ? COPY.running : COPY.run}
          </button>
          <span className={cn("text-[12px] tabular-nums", tooMany ? "text-danger" : "text-muted-foreground")}>
            {tooMany ? COPY.limit(MAX_CHECK_QUESTIONS) : count > 0 ? COPY.estimate(count, usd(count * context.checks.perQuestionUsd)) : null}
          </span>
        </div>
        {problem ? <ProblemLine text={TH.connectorUi.problems[problem.problem]} detail={problem.detail} /> : null}
        {answers ? (
          <div className="flex flex-col gap-2 rounded-2xl bg-muted/40 p-3.5">
            <p className="flex items-center gap-2 text-[12px] text-muted-foreground">
              {answers.list.some((answer) => answer.kept === false) ? <TriangleAlert className="size-3.5 text-warning" aria-hidden /> : <CircleCheck className="size-3.5 text-success" aria-hidden />}
              {COPY.spent(usd(answers.usd))}
            </p>
            <ul className="flex flex-col">
              {answers.list.map((answer, index) => (
                <AnswerRow key={`${answer.prompt}-${index}`} answer={answer} />
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
