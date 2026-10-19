import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { readUser } from "@/lib/server/session";
import { TH } from "@/lib/i18n/th";
import { runSamples } from "../cards/run-samples";
import { DataCardGallery, type DataCardResult } from "./gallery";
import { DATA_CARD_SAMPLES } from "./samples";

export const dynamic = "force-dynamic";

/** Development only: every DataCard variant the decision table and the pairings reach, drawn from the signed-in user's real query_metric results. */
export default async function DevDataCardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  const user = readUser(await cookies());
  if (!user) redirect("/login?next=/dev/data-cards");
  const answers = await runSamples(user, DATA_CARD_SAMPLES);
  const results: DataCardResult[] = DATA_CARD_SAMPLES.map((sample, index) => ({ ...sample, result: answers[index].result, paired: answers[index].paired }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">DataCard ทุกแบบ</h1>
        <p className="text-sm text-muted-foreground">
          {user.nameTh} · {TH.role[user.role]}
        </p>
      </header>
      <DataCardGallery results={results} />
    </main>
  );
}
