import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/app-shell";
import { USERS } from "@/lib/data/entities/users";
import { readUser } from "@/lib/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  return (
    <AppShell current={user} users={USERS}>
      {children}
    </AppShell>
  );
}
