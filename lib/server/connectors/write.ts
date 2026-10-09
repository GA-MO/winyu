import { z } from "zod";
import type { AccessContext } from "@/lib/contracts";
import { fence } from "@/lib/harness/fence";
import type { Readiness, Verdict, Verifier } from "@/lib/harness/types";
import { TH } from "@/lib/i18n/th";
import { currentAccess } from "@/lib/server/request-context";
import { callerIdentity } from "./presets";
import type { ConnectorRow, ConnectorToolBinding, ConnectorWrite } from "./types";

const ANY_ARGS = z.looseObject({});
const READINESS_CALL_ID = "readiness-check";

/** Reads one tool's rows as a person under that tool's own scope, before masking and fencing; null when the server did not answer. */
export type RowsReader = (binding: ConnectorToolBinding, args: Record<string, unknown>, access: AccessContext) => Promise<ConnectorRow[] | null>;

/** What a write sends, or why Winyu sends nothing. */
export type SentArgs = { ok: true; args: Record<string, unknown> } | { ok: false; error: string };

/** The arguments the model wrote, parsed by the tool's input schema. */
export function connectorArgs(binding: ConnectorToolBinding, input: unknown): Record<string, unknown> {
  return (binding.config.input ?? ANY_ARGS).parse(input) as Record<string, unknown>;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === undefined || left === null || right === undefined || right === null) return false;
  return String(left) === String(right);
}

/** The arguments with every pin applied: the caller's own id or department whatever the model sent, the call id in the idempotency argument; null when the caller has no value for an identity pin. */
export async function pinnedArgs(write: ConnectorWrite, args: Record<string, unknown>, access: AccessContext, toolCallId: string): Promise<Record<string, unknown> | null> {
  const self = write.pins.some((pin) => pin.kind === "identity") ? await callerIdentity(access) : null;
  const pinned = { ...args };
  for (const pin of write.pins) {
    const value = pin.kind === "call_id" ? toolCallId : (self?.[pin.key] ?? null);
    if (value === null) return null;
    pinned[pin.arg] = value;
  }
  return pinned;
}

async function guardRefusal(binding: ConnectorToolBinding, write: ConnectorWrite, args: Record<string, unknown>, access: AccessContext, read: RowsReader): Promise<string | null> {
  const label = binding.config.labelTh;
  for (const guard of write.guards) {
    const helper = binding.helper(guard.tool);
    const rows = helper ? await read(helper, {}, access) : null;
    if (rows === null) return TH.admin.connectors.guardUnavailable(label);
    if (!rows.some((row) => sameValue(row[guard.field], args[guard.arg]))) return TH.admin.connectors.guardRefused(label, fence(String(args[guard.arg] ?? "")));
  }
  return null;
}

/** What a write sends as this caller: pins applied, then every guard checked against its read tool under that tool's scope. */
export async function sentArgs(binding: ConnectorToolBinding, write: ConnectorWrite, args: Record<string, unknown>, access: AccessContext, toolCallId: string, read: RowsReader): Promise<SentArgs> {
  const pinned = await pinnedArgs(write, args, access, toolCallId);
  if (!pinned) return { ok: false, error: TH.admin.connectors.noIdentity(binding.config.labelTh) };
  const refusal = await guardRefusal(binding, write, pinned, access, read);
  return refusal ? { ok: false, error: refusal } : { ok: true, args: pinned };
}

/** Asks the person only for a write Winyu would send: it parses, the caller has every pinned value, and every guard passes. A write that fails here runs unasked and is refused by the same check. */
export function writeReadiness(binding: ConnectorToolBinding, write: ConnectorWrite, read: RowsReader): Readiness {
  return async (input) => {
    const parsed = (binding.config.input ?? ANY_ARGS).safeParse(input);
    if (!parsed.success) return false;
    return (await sentArgs(binding, write, parsed.data as Record<string, unknown>, currentAccess(), READINESS_CALL_ID, read)).ok;
  };
}

function replyRowOf(data: unknown): ConnectorRow | null {
  if (typeof data !== "object" || data === null || !("ok" in data) || data.ok !== true || !("rows" in data) || !Array.isArray(data.rows)) return null;
  const [row] = data.rows as ConnectorRow[];
  return row ?? null;
}

function fencedSame(shown: unknown, sent: unknown): boolean {
  return sameValue(shown, typeof sent === "string" ? fence(sent) : sent);
}

function fieldsDiffer(row: ConnectorRow, sent: Record<string, unknown>, fields: readonly string[], same: (shown: unknown, sent: unknown) => boolean): string[] {
  return fields.filter((field) => !same(row[field], sent[field]));
}

function passed(idField: string, fields: readonly string[]): Verdict {
  return { status: "passed", checks: [`reply carries ${idField}`, ...fields.map((field) => `${field} as sent`)] };
}

/** The write's post-condition: its reply carries the record id and the chosen arguments as sent (`echo`), or a read tool of the same connector finds that record with those values (`read_back`). The arguments compared are the ones Winyu sent, pins applied. */
export function writeVerifier(binding: ConnectorToolBinding, write: ConnectorWrite, read: RowsReader): Verifier {
  return async ({ input, observation, access }) => {
    const sent = await pinnedArgs(write, connectorArgs(binding, input), access, observation.actionId);
    if (!sent) return { status: "failed", reason: "the caller has no value for a pinned argument" };
    const reply = replyRowOf(observation.data);
    const verify = write.verify;
    const id = reply?.[verify.idField];
    if (!reply || id === undefined || id === null || id === "") return { status: "failed", reason: `the reply carries no ${verify.idField}` };
    if (verify.kind === "echo") {
      const differ = fieldsDiffer(reply, sent, verify.fields, fencedSame);
      return differ.length === 0 ? passed(verify.idField, verify.fields) : { status: "failed", reason: `the reply differs from what was sent in ${differ.join(", ")}` };
    }
    const helper = binding.helper(verify.tool);
    const rows = helper ? await read(helper, { [verify.idArg]: id }, access) : null;
    if (rows === null) return { status: "failed", reason: `${verify.tool} did not answer the read-back` };
    const found = rows.find((row) => sameValue(row[verify.idField], id));
    if (!found) return { status: "failed", reason: `${verify.tool} does not find the record` };
    const differ = fieldsDiffer(found, sent, verify.fields, sameValue);
    return differ.length === 0 ? passed(verify.idField, verify.fields) : { status: "failed", reason: `${verify.tool} reads back different ${differ.join(", ")}` };
  };
}
