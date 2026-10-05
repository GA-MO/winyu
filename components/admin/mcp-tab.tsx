import Link from "next/link";
import { Ban, ShieldCheck } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { liveAccessFor } from "@/lib/access/enforce";
import { USERS, findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { mcpToolsFor } from "@/lib/server/mcp";
import { mcpTokens, type McpToken } from "@/lib/server/mcp-tokens";
import { issueMcpTokenAction, revokeMcpTokenAction } from "@/app/(app)/admin/actions";
import { Avatar, EmptyLine, GHOST, Panel, Pill, stamp } from "./parts";
import { McpTokenForm } from "./mcp-token-form";

const COPY = TH.admin.mcpTab;

function toolCount(userId: string): number {
  const user = findUser(userId);
  return user ? mcpToolsFor(liveAccessFor(user)).length : 0;
}

function TokenRow({ token }: { token: McpToken }) {
  const person = findUser(token.userId);
  const issuer = findUser(token.issuedBy)?.nameTh ?? token.issuedBy;
  const revoked = token.revokedAt !== null;
  const used = token.lastUsedAt ? COPY.lastUsed(stamp(token.lastUsedAt)) : COPY.neverUsed;
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 border-t border-border px-5 py-3.5 first:border-t-0">
      <Avatar name={person?.nameTh ?? token.userId} />
      <div className="min-w-0">
        <p className={cn("truncate text-sm font-medium", revoked ? "text-muted-foreground" : "")}>
          {person?.nameTh ?? token.userId}
          <span className="font-normal text-muted-foreground">{` · ${person ? TH.role[person.role] : ""}`}</span>
        </p>
        <p className="mt-0.5 font-mono text-[12px] text-muted-foreground">{`mcp_…${token.hint}`}</p>
        <p className="mt-0.5 text-[11px] text-muted-foreground">{[COPY.issuedBy(issuer, stamp(token.issuedAt)), revoked && token.revokedAt ? COPY.revokedAt(stamp(token.revokedAt)) : used].join(" · ")}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        {revoked ? null : <Pill tone="primary">{COPY.tools(toolCount(token.userId))}</Pill>}
        <Pill tone={revoked ? "neutral" : "success"}>{revoked ? COPY.revoked : COPY.active}</Pill>
        <Link href={`/admin?tab=audit&user=${token.userId}`} className={GHOST}>
          {COPY.audit}
        </Link>
        {revoked ? null : (
          <form action={revokeMcpTokenAction}>
            <input type="hidden" name="token" value={token.id} />
            <button type="submit" className={cn(GHOST, "hover:text-danger")}>
              <Ban className="size-3.5" aria-hidden />
              {COPY.revoke}
            </button>
          </form>
        )}
      </div>
    </li>
  );
}

/** Admin tab for MCP access: issue a person a token their MCP client acts as them with, see every token and when it was used, and revoke one. */
export function McpTab({ endpoint }: { endpoint: string }) {
  const tokens = mcpTokens();
  const users = USERS.map((user) => ({ id: user.id, label: `${user.nameTh} · ${TH.role[user.role]}` }));
  return (
    <div className="flex flex-col gap-4">
      <Panel title={COPY.title} hint={COPY.hint}>
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-2.5 rounded-2xl bg-muted/50 px-3.5 py-2.5">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p className="text-[13px] text-foreground/85">
              <span className="font-medium">{COPY.readOnly}</span>
              {` · ${COPY.readOnlyBody}`}
            </p>
          </div>
          <McpTokenForm action={issueMcpTokenAction} users={users} endpoint={endpoint} />
        </div>
      </Panel>
      <Panel title={COPY.listTitle} hint={COPY.listHint} bodyClassName="px-0 pb-2 pt-3">
        {tokens.length === 0 ? (
          <div className="px-5 pb-3">
            <EmptyLine text={COPY.empty} />
          </div>
        ) : (
          <ul className="flex flex-col">
            {tokens.map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
