import { Bell } from "lucide-react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";
import { PersonaSwitcher } from "./persona-switcher";

export function TopBar({ current, users }: { current: User; users: readonly User[] }) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-border bg-card/80 px-4 py-2 backdrop-blur md:px-6">
      <span className="text-sm text-muted-foreground">{current.department}{current.region ? ` · ${TH.region[current.region]}` : ""}</span>
      <div className="flex items-center gap-2">
        <button type="button" aria-label={TH.topbar.notifications} title={TH.topbar.noNotifications} className="flex size-9 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-muted">
          <Bell className="size-4" aria-hidden />
        </button>
        <PersonaSwitcher current={current} users={users} />
      </div>
    </header>
  );
}
