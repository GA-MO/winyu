import { randomUUID } from "node:crypto";
import { liveAccessFor, toolsFor } from "@/lib/access/enforce";
import { findUser } from "@/lib/data/entities/users";
import { newRun, runWithRun, saveRun } from "@/lib/harness/runtime";
import { winyuTools } from "@/lib/server/agent/tools";
import { auditLog } from "@/lib/server/audit";
import { runWithAccess, runWithTurn } from "@/lib/server/request-context";

const USAGE = "usage: bun run call-tool <userId> <tool> [json-args]";
const SHOWN_CHARS = 600;

const [userId, toolName, rawArgs = "{}"] = process.argv.slice(2);
const user = userId ? findUser(userId) : null;
if (!user || !toolName) {
  console.error(USAGE);
  process.exit(2);
}

const access = liveAccessFor(user);
const tool = winyuTools()[toolName];
if (!tool) {
  console.error(`no tool ${toolName}`);
  process.exit(2);
}

const run = newRun(access.userId, null, { initiator: "system" });
const turn = { turnId: run.id, threadId: null, preloadPacketId: null, question: `call-tool ${toolName}`, queries: [] };
const input = tool.inputSchema().parse(JSON.parse(rawArgs));
const output = await runWithAccess(access, () => runWithTurn(turn, () => runWithRun(run, () => tool.execute(input, { toolCallId: randomUUID() }))));
saveRun(run);

const audit = auditLog().where((entry) => entry.turnId === run.id);
console.log(`${user.id} (${access.role}) · offered: ${toolsFor(access).includes(toolName as never) ? "yes" : "no"} · run ${run.id}`);
console.log(`audit: ${audit.map((entry) => `${entry.tool} ${entry.decision}${entry.code ? ` ${entry.code}` : ""}${entry.rule ? ` rule "${entry.rule.name}"` : ""}${entry.grant ? ` grant ${entry.grant.id} from ${entry.grant.grantorId} until ${entry.grant.expiresAt}` : ""}`).join("; ") || "none"}`);
console.log(JSON.stringify(output).slice(0, SHOWN_CHARS));
