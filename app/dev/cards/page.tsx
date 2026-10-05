import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { readUser } from "@/lib/server/session";
import { TH } from "@/lib/i18n/th";
import { Gallery } from "./gallery";
import { recordedSamples } from "./recorded-samples";
import { runSamples } from "./run-samples";
import { READ_SAMPLES, WRITE_SAMPLES } from "./samples";

export const dynamic = "force-dynamic";

/** Development only: every card kind, drawn from the signed-in user's real tool results, for review in one page. */
export default async function DevCardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const user = readUser(await cookies());
  if (!user) redirect("/login?next=/dev/cards");
  const reads = [...(await runSamples(user, READ_SAMPLES)), ...recordedSamples()];
  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{TH.shell.devCards}</h1>
        <p className="text-sm text-muted-foreground">
          {user.nameTh} · {TH.role[user.role]}
        </p>
      </header>
      <Gallery reads={reads} writes={WRITE_SAMPLES} />
    </main>
  );
}
