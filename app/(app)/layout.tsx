import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USERS } from "@/lib/data/entities/users";
import { readUser } from "@/lib/server/session";
import { AppChrome } from "@/components/chrome/app-chrome";
import { ThreadRail } from "@/components/threads/rail";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  return (
    <div className="cop-main relative min-h-dvh">
      <ThreadRail />
      <AppChrome user={user} users={USERS} />
      <main className="relative min-h-dvh">{children}</main>
    </div>
  );
}
