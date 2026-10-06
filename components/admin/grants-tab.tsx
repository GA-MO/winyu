import { GRANT_DOMAINS } from "@/lib/access/grants";
import { ROLE_IDS, type Grant, type RoleId } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { sliceLabel } from "@/lib/share/grant-label";
import { grantAuthorityOf, liveGrants } from "@/lib/server/grants";
import { revokeGrantAction, setGrantAuthorityAction } from "@/app/(app)/g/actions";
import { EmptyLine, GHOST, Panel, stamp } from "./parts";

const COPY = TH.grant.admin;
const ADMIN_GRANTS_PATH = "/admin";
const CELL = "px-3 py-2.5 text-left align-middle";

function nameOf(userId: string): string {
  return findUser(userId)?.nameTh ?? userId;
}

function GrantRow({ grant }: { grant: Grant }) {
  return (
    <tr className="border-t border-border">
      <td className={CELL}>{nameOf(grant.recipientId)}</td>
      <td className={CELL}>{nameOf(grant.grantorId)}</td>
      <td className={CELL}>{sliceLabel(grant.slice)}</td>
      <td className={`${CELL} whitespace-nowrap tabular-nums text-muted-foreground`}>{stamp(grant.expiresAt)}</td>
      <td className={`${CELL} text-right`}>
        <form action={revokeGrantAction}>
          <input type="hidden" name="grant" value={grant.id} />
          <input type="hidden" name="back" value={ADMIN_GRANTS_PATH} />
          <button type="submit" className={`${GHOST} h-8 hover:text-danger`}>{TH.grant.page.revoke}</button>
        </form>
      </td>
    </tr>
  );
}

function AuthorityRow({ role }: { role: RoleId }) {
  const domains = grantAuthorityOf(role);
  return (
    <tr className="border-t border-border">
      <td className={CELL}>{TH.role[role]}</td>
      <td className={CELL}>
        <form action={setGrantAuthorityAction} className="flex flex-wrap items-center gap-3">
          <input type="hidden" name="role" value={role} />
          {GRANT_DOMAINS.map((domain) => (
            <label key={domain} className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="domain" value={domain} defaultChecked={domains.includes(domain)} className="size-4 accent-primary" />
              {COPY.domains[domain]}
            </label>
          ))}
          <button type="submit" className={`${GHOST} h-8`}>{TH.common.save}</button>
        </form>
      </td>
    </tr>
  );
}

/** IT's view of temporary grants: every live grant with a revoke button, and which roles may grant which domains. */
export function GrantsTab() {
  const live = liveGrants();
  return (
    <div className="flex flex-col gap-4">
      <Panel title={COPY.title} hint={COPY.hint} bodyClassName={live.length > 0 ? "overflow-x-auto px-2 pb-2" : undefined}>
        {live.length === 0 ? (
          <EmptyLine text={COPY.empty} />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className={CELL}>{COPY.recipient}</th>
                <th className={CELL}>{COPY.grantor}</th>
                <th className={CELL}>{COPY.what}</th>
                <th className={CELL}>{COPY.until}</th>
                <th className={CELL} />
              </tr>
            </thead>
            <tbody>
              {live.map((grant) => (
                <GrantRow key={grant.id} grant={grant} />
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      <Panel title={COPY.authorityTitle} hint={COPY.authorityHint} bodyClassName="overflow-x-auto px-2 pb-2">
        <table className="w-full text-sm">
          <tbody>
            {ROLE_IDS.map((role) => (
              <AuthorityRow key={role} role={role} />
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
