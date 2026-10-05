import { Link2Off, UserCheck, X } from "lucide-react";
import { ROLE_IDS } from "@/lib/contracts";
import { findUser, USERS } from "@/lib/data/entities/users";
import { configuredTenantId, entraConfig, missingEntraSettings } from "@/lib/server/auth/entra";
import { authMode } from "@/lib/server/auth/mode";
import { identityLinks, suggestedUser, unlinkedAttempts, type IdentityLink, type SignInAttempt } from "@/lib/server/identity";
import { TH } from "@/lib/i18n/th";
import { dismissAttemptAction, grantAttemptAction, linkObjectIdAction, unlinkIdentityAction } from "@/app/(app)/admin/identity-actions";
import { Avatar, EmptyLine, FIELD, GHOST, INK, Panel, Pill, Select, stamp } from "./parts";

const COPY = TH.sso.admin;

function UserOptions() {
  return ROLE_IDS.map((role) => (
    <optgroup key={role} label={TH.role[role]}>
      {USERS.filter((user) => user.role === role).map((user) => (
        <option key={user.id} value={user.id}>
          {user.nameTh} · {user.title}
        </option>
      ))}
    </optgroup>
  ));
}

function Setting({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={value ? "break-all font-mono text-[12px]" : "text-sm text-muted-foreground"}>{value ?? COPY.notSet}</dd>
    </div>
  );
}

function ModePanel() {
  const mode = authMode();
  const config = entraConfig();
  const missing = missingEntraSettings();
  return (
    <Panel title={COPY.mode} hint={COPY.modeHint} action={<Pill tone={mode === "entra" ? "success" : "warning"}>{COPY.modes[mode]}</Pill>}>
      {mode === "demo" ? <p className="mb-4 rounded-2xl bg-warning/10 px-3.5 py-2.5 text-sm text-warning">{COPY.demoWarning}</p> : null}
      <dl className="grid gap-3 sm:grid-cols-3">
        <Setting label={COPY.tenant} value={configuredTenantId()} />
        <Setting label={COPY.client} value={process.env.ENTRA_CLIENT_ID || null} />
        <Setting label={COPY.redirect} value={config?.redirectUri.href ?? (process.env.ENTRA_REDIRECT_URI || null)} />
      </dl>
      <p className={missing.length > 0 ? "mt-3 text-xs text-warning" : "mt-3 text-xs text-success"}>{missing.length > 0 ? COPY.missing(missing.join(", ")) : COPY.ready}</p>
    </Panel>
  );
}

function AttemptRow({ attempt }: { attempt: SignInAttempt }) {
  const suggestion = suggestedUser(attempt);
  return (
    <li className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={attempt.name ?? attempt.email ?? "?"} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {attempt.name ?? attempt.email ?? attempt.subject}
            <Pill>{COPY.providers[attempt.provider]}</Pill>
          </p>
          {attempt.email ? <p className="truncate text-xs text-muted-foreground">{attempt.email}</p> : null}
          <p className="truncate font-mono text-[11px] text-muted-foreground">{attempt.subject}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{COPY.tries(attempt.count, stamp(attempt.lastAt))}</p>
          {suggestion ? <p className="mt-0.5 text-[11px] text-primary">{COPY.suggested}: {suggestion.nameTh}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <form action={grantAttemptAction} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="identity" value={attempt.id} />
          <Select name="user" required defaultValue={suggestion?.id ?? ""} aria-label={`${attempt.email ?? attempt.subject}: ${COPY.grantAs}`} className="w-64">
            <option value="" disabled>
              {COPY.pick}
            </option>
            <UserOptions />
          </Select>
          <button type="submit" className={INK}>
            <UserCheck className="size-4" aria-hidden />
            {COPY.grant}
          </button>
        </form>
        <form action={dismissAttemptAction}>
          <input type="hidden" name="identity" value={attempt.id} />
          <button type="submit" className={GHOST} aria-label={`${attempt.email ?? attempt.subject}: ${COPY.dismiss}`}>
            <X className="size-4" aria-hidden />
            {COPY.dismiss}
          </button>
        </form>
      </div>
    </li>
  );
}

function LinkRow({ link }: { link: IdentityLink }) {
  const user = findUser(link.userId);
  const by = findUser(link.linkedBy)?.nameTh ?? link.linkedBy;
  return (
    <li className="flex flex-col gap-3 border-t border-border py-4 first:border-t-0 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <Avatar name={user?.nameTh ?? link.userId} />
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
            {user?.nameTh ?? link.userId}
            {user ? <span className="text-xs font-normal text-muted-foreground">{TH.role[user.role]}</span> : null}
            <Pill tone="success">{COPY.providers[link.provider]}</Pill>
          </p>
          {link.email ? <p className="truncate text-xs text-muted-foreground">{link.email}</p> : null}
          <p className="truncate font-mono text-[11px] text-muted-foreground">{link.subject}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{COPY.linkedBy(by, stamp(link.linkedAt))}</p>
        </div>
      </div>
      <form action={unlinkIdentityAction}>
        <input type="hidden" name="identity" value={link.id} />
        <button type="submit" className={`${GHOST} hover:text-danger`} aria-label={`${user?.nameTh ?? link.userId}: ${COPY.unlink}`}>
          <Link2Off className="size-4" aria-hidden />
          {COPY.unlink}
        </button>
      </form>
    </li>
  );
}

function LinkAheadForm() {
  if (!configuredTenantId()) return <EmptyLine text={COPY.noTenant} />;
  return (
    <form action={linkObjectIdAction} className="flex flex-wrap items-center gap-2">
      <input name="objectId" required placeholder="00000000-0000-0000-0000-000000000000" aria-label={COPY.objectId} className={`${FIELD} w-80 font-mono text-[12px]`} />
      <input name="email" type="email" placeholder={COPY.email} aria-label={COPY.email} className={`${FIELD} w-64`} />
      <Select name="user" required defaultValue="" aria-label={COPY.grantAs} className="w-64">
        <option value="" disabled>
          {COPY.pick}
        </option>
        <UserOptions />
      </Select>
      <button type="submit" className={INK}>
        {COPY.aheadSubmit}
      </button>
    </form>
  );
}

/** Who may sign in: the sign-in mode and its settings, people waiting for access, accounts already linked, and a form to link ahead. */
export function SignInTab() {
  const attempts = unlinkedAttempts();
  const links = identityLinks();
  return (
    <div className="flex flex-col gap-4">
      <ModePanel />
      <Panel title={`${COPY.pending} (${attempts.length})`} hint={COPY.pendingHint}>
        {attempts.length === 0 ? <EmptyLine text={COPY.pendingEmpty} /> : <ul>{attempts.map((attempt) => <AttemptRow key={attempt.id} attempt={attempt} />)}</ul>}
      </Panel>
      <Panel title={`${COPY.linked} (${links.length})`} hint={COPY.linkedHint}>
        {links.length === 0 ? <EmptyLine text={COPY.linkedEmpty} /> : <ul>{links.map((link) => <LinkRow key={link.id} link={link} />)}</ul>}
      </Panel>
      <Panel title={COPY.ahead} hint={COPY.aheadHint}>
        <LinkAheadForm />
      </Panel>
    </div>
  );
}
