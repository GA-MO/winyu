import { findUser } from "@/lib/data/entities/users";
import { identityKey, identityLinks, linkIdentity, unlinkedAttempts, unlinkIdentity } from "@/lib/server/identity";

const USAGE = `usage:
  bun run identity list
  bun run identity link <objectId> <userId> [--email=<address>]   links an Entra object id in ENTRA_TENANT_ID to a mascop user
  bun run identity unlink <objectId>`;
const CLI_ACTOR = "cli";

function tenantOrExit(): string {
  const tenant = process.env.ENTRA_TENANT_ID;
  if (tenant) return tenant;
  console.error("set ENTRA_TENANT_ID first");
  process.exit(1);
}

function list() {
  for (const link of identityLinks()) console.log(`linked   ${link.id} -> ${link.userId} (${link.email ?? "no email"}) by ${link.linkedBy} at ${link.linkedAt}`);
  for (const attempt of unlinkedAttempts()) console.log(`waiting  ${attempt.id} ${attempt.email ?? ""} ${attempt.name ?? ""} x${attempt.count} last ${attempt.lastAt}`);
}

function link(objectId: string | undefined, userId: string | undefined, flags: string[]) {
  if (!objectId || !userId) return console.error(USAGE);
  const user = findUser(userId);
  if (!user) return console.error(`no mascop user ${userId}`);
  const email = flags.find((flag) => flag.startsWith("--email="))?.slice("--email=".length) ?? null;
  linkIdentity({ provider: "entra", tenant: tenantOrExit(), subject: objectId.toLowerCase(), email, name: null }, user.id, CLI_ACTOR, new Date().toISOString());
  console.log(`linked ${objectId} -> ${user.id} (${user.nameTh}, ${user.role})`);
}

function unlink(objectId: string | undefined) {
  if (!objectId) return console.error(USAGE);
  const removed = unlinkIdentity(identityKey({ provider: "entra", tenant: tenantOrExit(), subject: objectId.toLowerCase() }));
  console.log(removed ? `unlinked ${objectId}` : `${objectId} was not linked`);
}

const [command, ...rest] = process.argv.slice(2);
const flags = rest.filter((arg) => arg.startsWith("--"));
const [first, second] = rest.filter((arg) => !arg.startsWith("--"));

if (command === "list") list();
else if (command === "link") link(first, second, flags);
else if (command === "unlink") unlink(first);
else console.error(USAGE);
