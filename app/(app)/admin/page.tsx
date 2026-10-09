import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { LayoutDashboard, Plug, ScrollText, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { METRIC_IDS, ROLE_IDS, type AuditEntry, type MetricId, type RoleId } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { readUser } from "@/lib/server/session";
import { AccessTab } from "@/components/admin/access-tab";
import { ActiveTabInView } from "@/components/admin/active-tab-in-view";
import { AuditTab } from "@/components/admin/audit-tab";
import { AUDIT_RANGES, sinceOf, type AuditRange } from "@/lib/server/usage";
import { OverviewTab } from "@/components/admin/overview-tab";
import { SimulateTab } from "@/components/admin/simulate-tab";
import { RulesTab } from "@/components/admin/rules-tab";
import { ToolsTab } from "@/components/admin/tools-tab";
import { UsageTab } from "@/components/admin/usage-tab";
import { McpTab } from "@/components/admin/mcp-tab";
import { A2A_CARD_PATH } from "@/lib/server/a2a";
import { SignInTab } from "@/components/admin/sign-in-tab";
import { DocumentsTab } from "@/components/admin/documents-tab";
import { GrantsTab } from "@/components/admin/grants-tab";
import { FOCUS } from "@/components/admin/parts";

type SearchParams = Promise<{ tab?: string; run?: string; as?: string; metric?: string; user?: string; tool?: string; connector?: string; decision?: string; range?: string; limit?: string; role?: string; view?: string }>;

const TABS = ["overview", "access", "grants", "tools", "rules", "audit", "usage", "simulate", "mcp", "signin", "documents"] as const;
const LEGACY_TABS: Record<string, Tab> = { users: "access" };
const GROUPS = [
  { id: "overview", icon: LayoutDashboard, tabs: ["overview", "usage"] },
  { id: "access", icon: ShieldCheck, tabs: ["access", "grants", "simulate"] },
  { id: "tools", icon: Wrench, tabs: ["tools", "rules"] },
  { id: "audit", icon: ScrollText, tabs: ["audit"] },
  { id: "connections", icon: Plug, tabs: ["mcp", "signin", "documents"] },
] as const satisfies readonly { id: string; icon: LucideIcon; tabs: readonly Tab[] }[];
const DECISIONS: readonly AuditEntry["decision"][] = ["allow", "deny", "masked"];
const DEFAULT_ROLE: RoleId = "sales_rep";
const DEFAULT_AUDIT_RANGE: AuditRange = "7d";
const AUDIT_PAGE = 60;
const MCP_PATH = "/api/mcp";
const MAX_AUDIT_LIMIT = 2000;

type Tab = (typeof TABS)[number];

export const dynamic = "force-dynamic";

function tabOf(value: string | undefined): Tab {
  if (value && LEGACY_TABS[value]) return LEGACY_TABS[value];
  return TABS.includes(value as Tab) ? (value as Tab) : "overview";
}

function metricOf(value: string | undefined): MetricId {
  return METRIC_IDS.includes(value as MetricId) ? (value as MetricId) : "net_sales_volume";
}

function roleOf(value: string | undefined): RoleId {
  return ROLE_IDS.includes(value as RoleId) ? (value as RoleId) : DEFAULT_ROLE;
}

function decisionOf(value: string | undefined): AuditEntry["decision"] | null {
  return DECISIONS.includes(value as AuditEntry["decision"]) ? (value as AuditEntry["decision"]) : null;
}

function rangeOf(value: string | undefined): AuditRange {
  return AUDIT_RANGES.includes(value as AuditRange) ? (value as AuditRange) : DEFAULT_AUDIT_RANGE;
}

function limitOf(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, MAX_AUDIT_LIMIT) : AUDIT_PAGE;
}

function textOf(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null;
}

async function accessTokensTab() {
  const origin = await publicOrigin();
  return <McpTab endpoint={`${origin}${MCP_PATH}`} cardUrl={`${origin}${A2A_CARD_PATH}`} />;
}

async function publicOrigin(): Promise<string> {
  const incoming = await headers();
  const host = incoming.get("x-forwarded-host") ?? incoming.get("host") ?? "localhost";
  const protocol = incoming.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

function AskAgent() {
  const copy = TH.admin.ask;
  return (
    <form action="/c/new" className="flex w-full items-center gap-2 rounded-full border border-border bg-card p-1 pl-3.5 shadow-card focus-within:ring-2 focus-within:ring-ring sm:w-[26rem]">
      <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
      <input name="prompt" required placeholder={copy.placeholder} aria-label={copy.label} className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      <button type="submit" className={cn("inline-flex h-8 shrink-0 items-center rounded-full bg-ink px-3.5 text-sm font-medium text-ink-foreground transition hover:opacity-90", FOCUS)}>
        {copy.submit}
      </button>
    </form>
  );
}

function AskSuggestions() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {TH.admin.ask.suggestions.map((prompt) => (
        <Link
          key={prompt}
          href={`/c/new?prompt=${encodeURIComponent(prompt)}`}
          className={cn("rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground transition hover:border-foreground/25 hover:text-foreground", FOCUS)}
        >
          {prompt}
        </Link>
      ))}
    </div>
  );
}

type Group = (typeof GROUPS)[number];

function groupOf(tab: Tab): Group {
  return GROUPS.find((group) => (group.tabs as readonly Tab[]).includes(tab)) ?? GROUPS[0];
}

const PILL_BAR = "inline-flex gap-1 rounded-full border border-border bg-panel p-1 shadow-card backdrop-blur-xl";

function GroupTabs({ current }: { current: Group }) {
  return (
    <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
      <div className={PILL_BAR}>
        {GROUPS.map((group) => {
          const Icon = group.icon;
          const active = group.id === current.id;
          return (
            <Link
              key={group.id}
              href={`/admin?tab=${group.tabs[0]}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm transition",
                FOCUS,
                active ? "bg-ink font-medium text-ink-foreground shadow-card" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {TH.admin.groups[group.id]}
            </Link>
          );
        })}
      </div>
      <ActiveTabInView />
    </div>
  );
}

function SubTabs({ group, current }: { group: Group; current: Tab }) {
  if (group.tabs.length < 2) return null;
  return (
    <div className="-mx-1 max-w-full overflow-x-auto px-1 [scrollbar-width:none]">
      <div className={PILL_BAR}>
        {group.tabs.map((tab) => {
          const active = tab === current;
          return (
            <Link
              key={tab}
              href={`/admin?tab=${tab}`}
              aria-current={active ? "true" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center rounded-full px-3 text-sm transition",
                FOCUS,
                active ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {TH.admin.tabs[tab]}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function AdminNav({ current }: { current: Tab }) {
  const group = groupOf(current);
  return (
    <nav aria-label={TH.admin.title} className="z-20 flex flex-wrap items-center gap-2 sm:sticky sm:top-3">
      <GroupTabs current={group} />
      <SubTabs group={group} current={current} />
    </nav>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: SearchParams }) {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  const params = await searchParams;
  if (user.role !== "it_admin") notFound();
  const current = tabOf(params.tab);

  return (
    <div className="relative min-h-dvh overflow-clip">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 pb-10 pt-16 sm:px-8 sm:pt-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.03em]">
            <GradientText>{TH.admin.title}</GradientText>
          </h1>
          <AskAgent />
        </header>
        <AdminNav current={current} />
        {current === "overview" ? <AskSuggestions /> : null}
        {current === "overview" ? <OverviewTab /> : null}
        {current === "access" ? <AccessTab role={roleOf(params.role)} view={params.view === "matrix" ? "matrix" : "role"} viewer={user.id} /> : null}
        {current === "grants" ? <GrantsTab /> : null}
        {current === "tools" ? <ToolsTab viewer={user} /> : null}
        {current === "rules" ? <RulesTab /> : null}
        {current === "audit" ? <AuditTab
            filter={{ userId: textOf(params.user), tool: textOf(params.tool), connector: textOf(params.connector), decision: decisionOf(params.decision), since: sinceOf(rangeOf(params.range)) }}
            range={rangeOf(params.range)}
            limit={limitOf(params.limit)}
            openRun={textOf(params.run)}
          /> : null}
        {current === "usage" ? <UsageTab /> : null}
        {current === "signin" ? <SignInTab /> : null}
        {current === "simulate" ? <SimulateTab userId={params.as ?? USERS[0].id} metric={metricOf(params.metric)} /> : null}
        {current === "mcp" ? await accessTokensTab() : null}
        {current === "documents" ? <DocumentsTab /> : null}
      </div>
    </div>
  );
}
