import { randomUUID } from "node:crypto";

const USAGE = 'usage: bun run a2a:probe <token> ["question"] [--card=http://localhost:3200/.well-known/agent-card.json]';
const DEFAULT_CARD = "http://localhost:3200/.well-known/agent-card.json";
const DEFAULT_QUESTION = "ยอดขายเข้าแยกตามภาคไตรมาสนี้";

type Part = { kind: string; text?: string; data?: { tools?: { tool: string; result?: { rows?: Record<string, unknown>[] } }[] } };
type Answer = { result?: { id: string; status: { state: string }; artifacts?: { name?: string; parts: Part[] }[] }; error?: { code: number; message: string } };

const args = process.argv.slice(2);
const positional = args.filter((arg) => !arg.startsWith("--"));
const [token, question = DEFAULT_QUESTION] = positional;
const cardUrl = args.find((arg) => arg.startsWith("--card="))?.slice("--card=".length) ?? DEFAULT_CARD;
if (!token) {
  console.error(USAGE);
  process.exit(2);
}

const card = (await (await fetch(cardUrl)).json()) as { name: string; url: string; capabilities: { streaming: boolean } };
console.log(`card ${card.name} → ${card.url} · streaming ${card.capabilities.streaming}`);
const message = { kind: "message", role: "user", messageId: randomUUID(), parts: [{ kind: "text", text: question }] };
const response = await fetch(card.url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "message/send", params: { message } }) });
const answer = (await response.json()) as Answer;
if (answer.error) {
  console.log(`HTTP ${response.status} error ${answer.error.code}: ${answer.error.message}`);
  process.exit(1);
}
console.log(`task ${answer.result?.id} · ${answer.result?.status.state}`);
for (const artifact of answer.result?.artifacts ?? []) {
  for (const part of artifact.parts) {
    if (part.kind === "text") console.log(`text: ${part.text}`);
    for (const used of part.data?.tools ?? []) {
      console.log(`data: ${used.tool} · ${used.result?.rows?.length ?? 0} rows`);
      for (const row of used.result?.rows ?? []) console.log(`  ${Object.values(row).filter((value) => typeof value === "string").slice(0, 4).join(" · ")}`);
    }
  }
}
