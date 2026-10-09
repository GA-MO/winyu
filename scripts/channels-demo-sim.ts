import { createHash } from "node:crypto";
import { USERS } from "@/lib/data/entities/users";
import { identityKey, linkedUserOfKey, linkIdentity, type ExternalIdentity } from "@/lib/server/identity";
import { SIMULATED } from "./channel-harness";
import { startChannelSimulator } from "./channels-sim";
import { mockObjectId } from "./entra-mock";

const PORT = 3295;
const WINYU = process.env.WINYU_URL ?? "http://localhost:3100";
const LINKED_BY = "channels-demo";
const PEOPLE_PATH = "/ui/people";

/** A demo LINE user id for a Winyu user: `U` and 32 hex digits, as LINE writes them, the same on every run. */
function mockLineUserId(userId: string): string {
  return `U${createHash("sha256").update(`mock-line:${userId}`).digest("hex").slice(0, 32)}`;
}

const people = USERS.map((user) => ({ userId: user.id, nameTh: user.nameTh, title: user.title, oid: mockObjectId(user.id), lineUserId: mockLineUserId(user.id) }));

function linkOnce(identity: ExternalIdentity, userId: string, at: string): boolean {
  if (linkedUserOfKey(identityKey(identity))) return false;
  return linkIdentity(identity, userId, LINKED_BY, at) !== null;
}

const at = new Date().toISOString();
const linked = people.reduce((count, person) => {
  const teams = linkOnce({ provider: "entra", tenant: SIMULATED.teams.tenantId, subject: person.oid, email: null, name: null }, person.userId, at);
  const line = linkOnce({ provider: "line", tenant: SIMULATED.line.channelId, subject: person.lineUserId, email: null, name: null }, person.userId, at);
  return count + Number(teams) + Number(line);
}, 0);

const sim = startChannelSimulator({
  port: PORT,
  winyu: WINYU,
  teams: SIMULATED.teams,
  line: SIMULATED.line,
  extraRoutes: (request) => (request.method === "GET" && new URL(request.url).pathname === PEOPLE_PATH ? Response.json(people) : null),
});

console.log(`channel simulator on ${sim.origin} for ${WINYU}; linked ${linked} new identities (${people.length} people on Teams and LINE)`);
