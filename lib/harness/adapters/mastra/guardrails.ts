import { RegexFilterProcessor, type ProcessToolResultArgs, type Processor } from "@mastra/core/processors";
import { injectionIn, maskPersonalData, NEVER_IN_REPLY, withoutInjection, wrongSurnameRules, type GuardFinding, type InjectionKind, type PersonalKind } from "@/lib/harness/guard";
import { currentRun } from "@/lib/harness/runtime";
import { TH } from "@/lib/i18n/th";
import { recordGuardFinding } from "@/lib/server/audit";
import { accessOrNull } from "@/lib/server/request-context";
import type { RunInput } from "./turn";

const REPLY_CARRYOVER_CHARS = 32;
const WRONG_SURNAME = "wrong_surname";

type InputMessage = NonNullable<NonNullable<RunInput>["messages"]>[number];

/** What the guard did to one run request before anything read it: the request with personal data masked, and what it found in the person's newest message. */
export type GuardedInput = { input: RunInput; masked: PersonalKind[]; injection: InjectionKind[] };

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.flatMap((part: { type?: unknown; text?: unknown }) => (part?.type === "text" && typeof part.text === "string" ? [part.text] : [])).join(" ");
}

function maskedContent(content: unknown, found: Set<PersonalKind>): unknown {
  const mask = (text: string) => {
    const result = maskPersonalData(text);
    for (const kind of result.kinds) found.add(kind);
    return result.text;
  };
  if (typeof content === "string") return mask(content);
  if (!Array.isArray(content)) return content;
  return content.map((part: { type?: unknown; text?: unknown }) => (part?.type === "text" && typeof part.text === "string" ? { ...part, text: mask(part.text) } : part));
}

/** Masks the personal data in every message the person typed, before the harness, the audit, the thread title, memory extraction, Mastra memory, tracing or the model read the request, and reads the newest message for instructions aimed at the model. */
export function guardedRunInput(input: RunInput): GuardedInput {
  const messages = input?.messages;
  if (!input || !Array.isArray(messages)) return { input, masked: [], injection: [] };
  const found = new Set<PersonalKind>();
  const guarded = messages.map((message: InputMessage) => (message?.role === "user" ? { ...message, content: maskedContent(message.content, found) } : message));
  const newest = [...guarded].reverse().find((message) => message?.role === "user");
  return { input: { ...input, messages: guarded }, masked: [...found], injection: injectionIn(textOf(newest?.content)) };
}

/** The findings a guarded request leaves on its run: personal data masked, and instructions recorded but passed on, since what a person may see is enforced in code whatever they type. */
export function inputFindings(guarded: GuardedInput): GuardFinding[] {
  return [
    ...(guarded.masked.length > 0 ? [{ source: "user_input" as const, check: "personal_data" as const, kinds: guarded.masked, action: "masked" as const }] : []),
    ...(guarded.injection.length > 0 ? [{ source: "user_input" as const, check: "injection" as const, kinds: guarded.injection, action: "warned" as const }] : []),
  ];
}

function record(finding: GuardFinding): void {
  const userId = currentRun()?.userId ?? accessOrNull()?.userId;
  if (userId) recordGuardFinding(finding, userId);
}

function withoutInjectionDeep(value: unknown, found: Set<InjectionKind>): unknown {
  if (typeof value === "string") {
    const cleaned = withoutInjection(value);
    for (const kind of cleaned.kinds) found.add(kind);
    return cleaned.kinds.length > 0 ? cleaned.text : value;
  }
  if (Array.isArray(value)) return value.map((inner) => withoutInjectionDeep(inner, found));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, withoutInjectionDeep(inner, found)]));
}

/** Reads every tool result before it re-enters the prompt and cuts out any sentence that tries to instruct the model; the fence still marks the rest as data. */
export class ToolResultInjectionGuard implements Processor<"tool-result-injection-guard"> {
  readonly id = "tool-result-injection-guard" as const;
  readonly name = "Tool result injection guard";

  processToolResult({ toolName, toolCallId, args, result, messageList }: ProcessToolResultArgs): undefined {
    const found = new Set<InjectionKind>();
    const cleaned = withoutInjectionDeep(result, found);
    if (found.size === 0) return undefined;
    messageList.updateToolInvocation({ type: "tool-invocation", toolInvocation: { state: "result", toolCallId, toolName, args, result: cleaned } });
    record({ source: "tool_result", check: "injection", kinds: [...found], action: "neutralized" });
    return undefined;
  }
}

/** One pass over the model's reply, streamed and saved, holding back only enough characters to catch a match split across chunks (one processor, since two regex filters on one stream share its carryover): a Thai national ID or a bank account number is masked (phones and emails pass, since the only ones the model can see are colleagues' work contacts the gateway already scoped), and a colleague's first name written with a surname the directory does not hold takes their directory name (AI-289: "คุณอนุชา วงศ์สุวรรณ" becomes "คุณอนุชา พรหมศรี"; the prompt already says names come only from tools or the person's words, this holds when the model breaks it). Each kind is recorded on the run and the audit. */
export function replyGuard(): RegexFilterProcessor {
  const guard = new RegexFilterProcessor({
    rules: [
      { name: "national_id", pattern: NEVER_IN_REPLY.national_id, replacement: TH.guard.mask.national_id },
      { name: "bank_account", pattern: NEVER_IN_REPLY.bank_account, replacement: TH.guard.mask.bank_account },
      ...wrongSurnameRules(),
    ],
    strategy: "redact",
    phase: "output",
    streamCarryoverSize: REPLY_CARRYOVER_CHARS,
  });
  guard.onViolation = ({ detail }) => {
    const rules = new Set(((detail as { redactions?: { rule: string }[] } | undefined)?.redactions ?? []).map((redaction) => redaction.rule));
    const personal = [...rules].filter((rule) => rule !== WRONG_SURNAME);
    if (personal.length > 0) record({ source: "model_output", check: "personal_data", kinds: personal, action: "masked" });
    if (rules.has(WRONG_SURNAME)) record({ source: "model_output", check: "person_name", kinds: [WRONG_SURNAME], action: "corrected" });
  };
  return guard;
}
