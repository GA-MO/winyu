import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { personaOf } from "@/lib/server/portraits";
import { readUser } from "@/lib/server/session";
import { handoffEnabled } from "@/lib/access/enforce";
import { ShareProvider } from "@/components/share/share-sheet";
import { AppChrome } from "@/components/chrome/app-chrome";
import { ThreadRail } from "@/components/threads/rail";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  return (
    <ShareProvider open={handoffEnabled()}>
      <div className="winyu-main relative min-h-dvh">
        <ThreadRail />
        <AppChrome user={personaOf(user)} />
        <main className="relative min-h-dvh">{children}</main>
      </div>
    </ShareProvider>
  );
}
