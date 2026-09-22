import type { User } from "@/lib/contracts";
import { Sidebar } from "./sidebar";
import { TopBar } from "./top-bar";

export function AppShell({ current, users, children }: { current: User; users: readonly User[]; children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar current={current} users={users} />
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </div>
  );
}
