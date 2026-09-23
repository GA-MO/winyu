import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "vexa/lib/utils";
import { METRIC_IDS, ROLE_IDS, type RoleId } from "@/lib/contracts";
import { ROLE_POLICIES } from "@/lib/access/policies";
import { permissionsFor } from "@/lib/access/role-overrides";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { PersonList } from "@/components/login/person-list";
import { ROLE_ICONS } from "@/components/login/role-icon";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";

type SearchParams = Promise<{ role?: string; next?: string }>;

const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export const dynamic = "force-dynamic";

function roleOf(value: string | undefined): RoleId | null {
  return ROLE_IDS.includes(value as RoleId) ? (value as RoleId) : null;
}

function membersOf(role: RoleId) {
  return USERS.filter((user) => user.role === role);
}

function reachOf(role: RoleId): { scope: string; sees: string; tools: string } {
  const permissions = permissionsFor(role);
  const full = METRIC_IDS.filter((id) => permissions.metricAcl[id] === "full").length;
  const masked = METRIC_IDS.filter((id) => permissions.metricAcl[id] === "masked").length;
  return {
    scope: ROLE_POLICIES[role].regions === "own" ? TH.login.scopeOwn : TH.login.scopeAll,
    sees: TH.login.sees(full, masked),
    tools: TH.login.tools(permissions.toolAllow.length),
  };
}

function Steps({ current }: { current: 1 | 2 }) {
  const items = [TH.login.stepRole, TH.login.stepPerson];
  return (
    <ol className="flex items-center gap-2 text-xs font-medium">
      {items.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {index > 0 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-[11px]",
                active ? "bg-ink text-ink-foreground" : done ? "bg-success/15 text-success" : "border border-border text-muted-foreground",
              )}
            >
              {step}
            </span>
            <span className={active ? "text-foreground" : "text-muted-foreground"}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

function RoleGrid() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {ROLE_IDS.map((role, index) => {
        const Icon = ROLE_ICONS[role];
        const reach = reachOf(role);
        return (
          <li key={role} className="animate-hero-rise" style={{ animationDelay: `${index * 35}ms` }}>
            <Link
              href={`/login?role=${role}`}
              className={cn(
                "group flex h-full flex-col gap-3 rounded-3xl border border-border bg-card p-5 shadow-card transition duration-300 hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-lift",
                FOCUS,
              )}
            >
              <span className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-2xl bg-bubble text-accent-foreground transition group-hover:bg-ink group-hover:text-ink-foreground">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="text-xs tabular-nums text-muted-foreground">{TH.login.people(membersOf(role).length)}</span>
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-display text-[15px] font-semibold leading-snug tracking-tight">{TH.role[role]}</span>
                <span className="text-xs leading-relaxed text-muted-foreground">{TH.login.roles[role]}</span>
              </span>
              <span className="mt-auto flex flex-wrap gap-1 pt-1">
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{reach.scope}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{reach.sees}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function RoleSummary({ role }: { role: RoleId }) {
  const Icon = ROLE_ICONS[role];
  const reach = reachOf(role);
  return (
    <div className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-5 shadow-card sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-4 sm:items-center">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-ink text-ink-foreground">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-lg font-semibold tracking-tight">{TH.role[role]}</p>
          <p className="text-sm text-muted-foreground">{TH.login.roles[role]}</p>
          <p className="mt-2 flex flex-wrap gap-1">
            {[reach.scope, reach.sees, reach.tools].map((item) => (
              <span key={item} className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                {item}
              </span>
            ))}
          </p>
        </div>
      </div>
      <Link href="/login" className={cn("inline-flex h-9 w-fit shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3.5 text-sm text-muted-foreground shadow-card transition hover:text-foreground", FOCUS)}>
        <ArrowLeft className="size-4" aria-hidden />
        {TH.login.changeRole}
      </Link>
    </div>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const role = roleOf((await searchParams).role);
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 sm:px-8 sm:py-16">
        <header className="flex flex-col gap-4">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-muted-foreground shadow-card">
            <span className="size-1.5 animate-hero-pulse rounded-full bg-success" />
            {TH.app.name} · {TH.app.tagline}
          </p>
          <h1 className="font-display text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[3.25rem]">
            {TH.login.heading} <GradientText>{TH.login.headingAccent}</GradientText>
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">{TH.login.subtitle}</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Steps current={role ? 2 : 1} />
            <p className="text-xs text-muted-foreground">{TH.login.demoNotice}</p>
          </div>
        </header>

        {role ? (
          <section className="flex flex-col gap-4">
            <RoleSummary role={role} />
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h2 className="text-[15px] font-semibold tracking-tight">{TH.login.whoTitle(TH.role[role])}</h2>
              <p className="text-xs text-muted-foreground">{TH.login.whoHint}</p>
            </div>
            <PersonList users={membersOf(role)} />
          </section>
        ) : (
          <RoleGrid />
        )}
      </div>
    </main>
  );
}
