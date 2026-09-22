import { cookies } from "next/headers";
import { ElevatedCard } from "@/components/shell/elevated-card";
import { PageHeader } from "@/components/shell/page-header";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";

const PLACEHOLDER_CARDS = [TH.dashboard.pinned, TH.dashboard.suggested, TH.dashboard.changes];

export default async function DashboardPage() {
  const user = readUser(await cookies());
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={TH.dashboard.title} description={user ? TH.dashboard.greeting(user.nameTh) : undefined} />
      <div className="grid gap-4 md:grid-cols-3">
        {PLACEHOLDER_CARDS.map((title) => (
          <ElevatedCard key={title} title={title}>
            <p className="text-sm text-muted-foreground">{TH.dashboard.placeholder}</p>
          </ElevatedCard>
        ))}
      </div>
    </div>
  );
}
