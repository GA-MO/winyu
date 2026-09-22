import { TH } from "@/lib/i18n/th";

export type NavItem = { href: string; label: string; icon: "dashboard" | "chat" | "inbox" | "alerts" | "memory" | "outbox" | "admin" };

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: TH.nav.dashboard, icon: "dashboard" },
  { href: "/chat", label: TH.nav.chat, icon: "chat" },
  { href: "/inbox", label: TH.nav.inbox, icon: "inbox" },
  { href: "/alerts", label: TH.nav.alerts, icon: "alerts" },
  { href: "/memory", label: TH.nav.memory, icon: "memory" },
  { href: "/outbox", label: TH.nav.outbox, icon: "outbox" },
  { href: "/admin", label: TH.nav.admin, icon: "admin" },
];
