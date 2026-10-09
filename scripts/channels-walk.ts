import { linkIdentity } from "@/lib/server/identity";
import { SIMULATED } from "./channel-sim-env";
import { startChannelSimulator, type Sent } from "./channels-sim";
import { mockObjectId } from "./entra-mock";

const SIMULATOR_PORT = Number(process.env.WALK_SIM_PORT ?? 3295);
const APP = process.env.WALK_APP ?? "http://localhost:3218";
const KRIT_LINE = "U00000000000000000000000000krit1";
const REPLY_WAIT_TRIES = 50;
const REPLY_WAIT_MS = 200;
const BY_REGION = { metric: "net_sales_value", dims: ["region"], grain: "month", range: { from: "2026-09-01", to: "2026-09-22" }, compare: "target", filters: {}, sort: "value_desc", limit: 10 };
const STEPS = (process.env.WALK_STEPS ?? "teams-stranger,teams-linked,line-link,line-ask,share-teams,share-line,share-email").split(",");

const sim = startChannelSimulator({ port: SIMULATOR_PORT, winyu: APP, teams: SIMULATED.teams, line: SIMULATED.line });

function show(step: string, sent: readonly Sent[]): void {
  const messages = sent.filter((entry) => entry.kind === "message" || entry.kind === "reply" || entry.kind === "push");
  console.log(`\n${step}: ${messages.length} message(s)`);
  for (const entry of messages) console.log(`  ${entry.channel} ${entry.kind} -> ${entry.to}\n  ${JSON.stringify(entry.body)}`);
}

async function sessionCookie(userId: string): Promise<string> {
  const response = await fetch(`${APP}/api/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

function linkUriOf(sent: readonly Sent[]): string {
  return JSON.stringify(sent.map((entry) => entry.body)).match(/"uri":"([^"]*\/link\/line\/[^"]+)"/)?.[1] ?? "";
}

async function sentAfter(before: number, kind: string): Promise<Sent[]> {
  for (let tries = 0; tries < REPLY_WAIT_TRIES && !sim.sent.slice(before).some((entry) => entry.kind === kind); tries += 1) await Bun.sleep(REPLY_WAIT_MS);
  return sim.sent.slice(before);
}

async function lineLink(): Promise<void> {
  const prompt = await sim.lineSay(KRIT_LINE, "สวัสดี", "Krit (LINE)");
  show("line-link prompt", prompt.sent);
  const token = decodeURIComponent(linkUriOf(prompt.sent).split("/link/line/")[1] ?? "");
  const cookie = await sessionCookie("u_krit");
  console.log(`link page: HTTP ${(await fetch(`${APP}/link/line/${encodeURIComponent(token)}`, { headers: { cookie } })).status}`);
  const confirmed = await fetch(`${APP}/api/line-link`, { method: "POST", redirect: "manual", headers: { cookie, origin: APP, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
  const before = sim.sent.length;
  await fetch(confirmed.headers.get("location") ?? "");
  show("line-link finished", await sentAfter(before, "reply"));
}

async function share(channel: "email" | "teams" | "line"): Promise<void> {
  const before = sim.sent.length;
  const cookie = await sessionCookie("u_thana");
  const body = { card: { kind: "tool", reads: [{ tool: "query_metric", input: BY_REGION }] }, question: "ยอดขายแยกตามภาคเดือนนี้", note: "ช่วยดูภาคอีสานหน่อย", recipients: [{ userId: "u_krit", channel }] };
  const response = await fetch(`${APP}/api/shares`, { method: "POST", headers: { cookie, origin: APP, "content-type": "application/json" }, body: JSON.stringify(body) });
  console.log(`\nshare by ${channel}: HTTP ${response.status} ${await response.text()}`);
  if (channel !== "email") show(`share-${channel}`, await sentAfter(before, channel === "teams" ? "message" : "push"));
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  "teams-stranger": async () => show("teams-stranger", (await sim.teamsSay({ oid: "0e0e0e0e-0000-4000-8000-00000000bad1", name: "Guest Contractor" }, "ยอดขายเดือนนี้")).sent),
  "teams-linked": async () => show("teams-linked", (await sim.teamsSay({ oid: mockObjectId("u_krit"), name: "กฤต" }, "ยอดขายเดือนนี้")).sent),
  "line-link": lineLink,
  "line-ask": async () => show("line-ask", (await sim.lineSay(KRIT_LINE, "ยอดขายเดือนนี้")).sent),
  "share-teams": () => share("teams"),
  "share-line": () => share("line"),
  "share-email": () => share("email"),
};

linkIdentity({ provider: "entra", tenant: SIMULATED.teams.tenantId, subject: mockObjectId("u_krit"), email: null, name: null }, "u_krit", "channels-walk", new Date().toISOString());
for (const step of STEPS) await SCENARIOS[step]();
sim.stop();
