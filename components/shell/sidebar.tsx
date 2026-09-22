"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Brain, Inbox, LayoutDashboard, MessageSquare, Send, Shield } from "lucide-react";
import { TH } from "@/lib/i18n/th";
import { NAV_ITEMS, type NavItem } from "./nav-items";

const ICONS: Record<NavItem["icon"], typeof Bell> = {
  dashboard: LayoutDashboard,
  chat: MessageSquare,
  inbox: Inbox,
  alerts: Bell,
  memory: Brain,
  outbox: Send,
  admin: Shield,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-full shrink-0 flex-col gap-1 border-b border-border bg-card px-3 py-3 md:h-dvh md:w-60 md:border-r md:border-b-0 md:py-5">
      <Link href="/" className="mb-2 hidden items-center gap-2 px-2 md:flex">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground" style={{ boxShadow: "0 8px 20px -8px var(--vexa-glow)" }}>C</span>
        <span className="text-lg font-semibold tracking-tight">{TH.app.name}</span>
      </Link>
      <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.icon];
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${active ? "bg-secondary font-medium text-secondary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <Icon className="size-4" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
