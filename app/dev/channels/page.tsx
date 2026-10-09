import Link from "next/link";
import { notFound } from "next/navigation";
import { TH } from "@/lib/i18n/th";
import { ChannelsDemo } from "./channels-demo";

export const dynamic = "force-dynamic";

/** Development only, always in the light theme as the real apps look: Winyu in a Teams window and a LINE phone, driven through the channel simulator the dev server points at. */
export default function DevChannelsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <main className="theme-light min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6">
        <header className="mb-6 flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-4">
            <h1 className="text-2xl font-semibold tracking-tight">{TH.channelsDemo.title}</h1>
            <Link href="/dev/mail" className="text-sm font-medium text-primary underline-offset-2 hover:underline">
              {TH.channelsDemo.mailLink}
            </Link>
          </div>
          <p className="text-sm text-muted-foreground">{TH.channelsDemo.subtitle}</p>
        </header>
        <ChannelsDemo simulator={process.env.TEAMS_SIMULATOR_URL ?? null} />
      </div>
    </main>
  );
}
