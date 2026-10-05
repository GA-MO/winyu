import { cookies, headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChartColumn, Eye, FileText, KeyRound, LayoutDashboard, Plug, Scale, ScrollText, ShieldCheck, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { METRIC_IDS, ROLE_IDS, type AuditEntry, type MetricId, type RoleId } from "@/lib/contracts";
import { USERS } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";
import { readUser } from "@/lib/server/session";
import { AccessTab } from "@/components/admin/access-tab";
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
import { Avatar, FOCUS } from "@/components/admin/parts";

type SearchParams = Promise<{ tab?: string; run?: string; as?: string; metric?: string; user?: string; tool?: string; connector?: string; decision?: string; range?: string; limit?: string; role?: string; view?: string }>;

const TABS = ["overview", "access", "tools", "rules", "audit", "usage", "simulate", "mcp", "signin", "documents"] as const;
const LEGACY_TABS: Record<string, Tab> = { users: "access" };
const TAB_ICONS: Record<Tab, LucideIcon> = { overview: LayoutDashboard, access: ShieldCheck, tools: Wrench, rules: Scale, audit: ScrollText, usage: ChartColumn, simulate: Eye, mcp: Plug, signin: KeyRound, documents: FileText };
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
    <div className="flex flex-col gap-2.5">
      <form action="/c/new" className="flex items-center gap-2 rounded-full border border-border bg-card p-1.5 pl-4 shadow-lift focus-within:ring-2 focus-within:ring-ring">
        <Sparkles className="size-4 shrink-0 text-primary" aria-hidden />
        <input name="prompt" required placeholder={copy.placeholder} aria-label={copy.label} className="h-9 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
        <button type="submit" className={cn("inline-flex h-9 shrink-0 items-center rounded-full bg-ink px-4 text-sm font-medium text-ink-foreground transition hover:opacity-90", FOCUS)}>
          {copy.submit}
        </button>
      </form>
      <div className="flex flex-wrap gap-1.5">
        {copy.suggestions.map((prompt) => (
          <Link
            key={prompt}
            href={`/c/new?prompt=${encodeURIComponent(prompt)}`}
            className={cn("rounded-full border border-border bg-card/70 px-3 py-1 text-xs text-muted-foreground transition hover:border-foreground/25 hover:text-foreground", FOCUS)}
          >
            {prompt}
          </Link>
        ))}
      </div>
    </div>
  );
}

function TabBar({ current }: { current: Tab }) {
  return (
    <nav className="sticky top-3 z-20 -mx-1 overflow-x-auto px-1 [scrollbar-width:none]">
      <div className="inline-flex gap-1 rounded-full border border-border bg-panel p-1 shadow-card backdrop-blur-xl">
        {TABS.map((item) => {
          const Icon = TAB_ICONS[item];
          const active = item === current;
          return (
            <Link
              key={item}
              href={`/admin?tab=${item}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm transition",
                FOCUS,
                active ? "bg-ink font-medium text-ink-foreground shadow-card" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" aria-hidden />
              {TH.admin.tabs[item]}
            </Link>
          );
        })}
      </div>
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
    <div className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-10 pt-16 sm:px-8 sm:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-[2.25rem] font-semibold leading-tight tracking-[-0.03em]">
              <GradientText>{TH.admin.title}</GradientText>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{TH.admin.subtitle}</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-3.5 shadow-card">
            <Avatar name={user.nameTh} size="sm" />
            <span className="text-xs text-muted-foreground">{TH.admin.signedInAs(user.nameTh)}</span>
          </div>
        </header>

        <AskAgent />
        <TabBar current={current} />
        {current === "overview" ? <OverviewTab /> : null}
        {current === "access" ? <AccessTab role={roleOf(params.role)} view={params.view === "matrix" ? "matrix" : "role"} viewer={user.id} /> : null}
        {current === "tools" ? <ToolsTab /> : null}
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
