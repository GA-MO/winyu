import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { USERS } from "@/lib/data/entities/users";
import { personaOf } from "@/lib/server/portraits";
import { readUser } from "@/lib/server/session";
import { AppChrome } from "@/components/chrome/app-chrome";
import { ThreadRail } from "@/components/threads/rail";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  return (
    <div className="relative flex min-h-dvh">
      <ThreadRail />
      <div className="min-w-0 flex-1">
        <AppChrome user={personaOf(user)} people={USERS.map(personaOf)} />
        <main className="relative">{children}</main>
      </div>
    </div>
  );
}
