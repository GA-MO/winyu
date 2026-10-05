import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { linkIdentity } from "@/lib/server/identity";
import { SIMULATED } from "./channel-harness";
import { startChannelSimulator, type Sent, type TeamsPerson } from "./channels-sim";
import { mockObjectId } from "./entra-mock";

const SIMULATOR_PORT = 3295;
const APP = process.env.WALK_APP ?? "http://localhost:3218";
const OUT_DIR = path.join(process.cwd(), ".shots");
const QUESTION = "ยอดขายแยกตามภาคเดือนนี้";
const WATCH_QUESTION = "เตือนฉันถ้าสต๊อกดีซีลำพูนพอขายต่ำกว่า 10 วัน";
const STEPS = (process.env.WALK_STEPS ?? "teams-ceo,teams-krit,teams-stranger,teams-group,line-link,line-krit,line-approval").split(",");

const sim = startChannelSimulator({ port: SIMULATOR_PORT, winyu: APP, teams: SIMULATED.teams, line: SIMULATED.line });
const transcript: { step: string; channel: string; sent: Sent[] }[] = [];

function person(userId: string, name: string): TeamsPerson {
  return { oid: mockObjectId(userId), name };
}

function save(step: string, channel: string, sent: Sent[]): void {
  transcript.push({ step, channel, sent });
  const messages = sent.filter((entry) => entry.kind === "message" || entry.kind === "reply" || entry.kind === "push");
  console.log(`${step}: ${messages.length} message(s) ${messages.map((entry) => JSON.stringify(entry.body).slice(0, 160)).join(" | ")}`);
}

async function sessionCookie(userId: string): Promise<string> {
  const response = await fetch(`${APP}/api/session`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
  return (response.headers.get("set-cookie") ?? "").split(";")[0];
}

function linkUriOf(sent: Sent[]): string {
  const json = JSON.stringify(sent.map((entry) => entry.body));
  return json.match(/"uri":"([^"]*\/link\/line\/[^"]+)"/)?.[1] ?? "";
}

async function lineLink(lineUserId: string, displayName: string, userId: string): Promise<void> {
  const prompt = await sim.lineSay(lineUserId, "สวัสดี", displayName);
  save(`line-link-prompt-${userId}`, "line", prompt.sent);
  const token = decodeURIComponent(linkUriOf(prompt.sent).split("/link/line/")[1] ?? "");
  const cookie = await sessionCookie(userId);
  const page = await fetch(`${APP}/link/line/${encodeURIComponent(token)}`, { headers: { cookie } });
  console.log(`link page for ${userId}: HTTP ${page.status}`);
  const confirmed = await fetch(`${APP}/api/line-link`, { method: "POST", redirect: "manual", headers: { cookie, origin: APP, "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }).toString() });
  const dialog = confirmed.headers.get("location") ?? "";
  console.log(`confirm: HTTP ${confirmed.status} -> ${dialog.slice(0, 80)}`);
  const before = sim.sent.length;
  await fetch(dialog);
  for (let tries = 0; tries < 50 && !sim.sent.slice(before).some((entry) => entry.kind === "reply"); tries += 1) await new Promise((resolve) => setTimeout(resolve, 200));
  save(`line-linked-${userId}`, "line", sim.sent.slice(before));
}

const SCENARIOS: Record<string, () => Promise<void>> = {
  "teams-ceo": async () => save("teams-ceo", "teams", (await sim.teamsSay(person("u_thana", "ธนา"), QUESTION)).sent),
  "teams-krit": async () => save("teams-krit", "teams", (await sim.teamsSay(person("u_krit", "กฤษณ์"), QUESTION)).sent),
  "teams-stranger": async () => save("teams-stranger", "teams", (await sim.teamsSay({ oid: "0e0e0e0e-0000-4000-8000-00000000bad1", name: "Guest Contractor" }, QUESTION)).sent),
  "teams-group": async () => save("teams-group", "teams", (await sim.teamsSay({ ...person("u_thana", "ธนา"), group: true }, QUESTION)).sent),
  "teams-approval": async () => {
    const wee = person("u_wee", "วีระ");
    const asking = await sim.teamsSay(wee, WATCH_QUESTION);
    save("teams-approval", "teams", asking.sent);
    const value = JSON.stringify(asking.sent).match(/"actionId":"winyu.approve","value":"([^"]+)"/)?.[1] ?? "";
    save("teams-approved", "teams", (await sim.teamsPress(wee, "winyu.approve", value)).sent);
  },
  "line-prompt": async () => {
    const prompt = await sim.lineSay("U000000000000000000000000000nok1", "สวัสดี", "Nok (LINE)");
    save("line-prompt", "line", prompt.sent);
    console.log(`link page: ${linkUriOf(prompt.sent)}`);
  },
  "line-link": () => lineLink("U00000000000000000000000000krit1", "Krit (LINE)", "u_krit"),
  "line-krit": async () => save("line-krit", "line", (await sim.lineSay("U00000000000000000000000000krit1", QUESTION)).sent),
  "line-approval": async () => {
    await lineLink("U000000000000000000000000000wee1", "Wee (LINE)", "u_wee");
    const asking = await sim.lineSay("U000000000000000000000000000wee1", WATCH_QUESTION);
    save("line-approval", "line", asking.sent);
    const data = JSON.stringify(asking.sent).match(/"data":"(approval=[^"]+approve=1)"/)?.[1] ?? "";
    save("line-approved", "line", (await sim.linePress("U000000000000000000000000000wee1", data)).sent);
  },
};

for (const userId of ["u_thana", "u_krit", "u_wee"]) {
  linkIdentity({ provider: "entra", tenant: SIMULATED.teams.tenantId, subject: mockObjectId(userId), email: null, name: null }, userId, "channels-walk", new Date().toISOString());
}
for (const step of STEPS) await SCENARIOS[step]();
mkdirSync(OUT_DIR, { recursive: true });
writeFileSync(path.join(OUT_DIR, "f11-transcript.json"), JSON.stringify(transcript, null, 2));
console.log(`saved .shots/f11-transcript.json (${transcript.length} steps)`);
sim.stop();
