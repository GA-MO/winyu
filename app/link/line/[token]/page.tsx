import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Link2, MessageCircle } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { TH } from "@/lib/i18n/th";
import { linkRequest } from "@/lib/server/channels/line-link";
import { readUser } from "@/lib/server/session";

const COPY = TH.channels.link;
const FOCUS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

type PageProps = { params: Promise<{ token: string }> };

export const dynamic = "force-dynamic";

/** Where a LINE user's link button lands after they sign in: whose LINE account will ask as whom, and one button that spends the request and goes on to LINE's account-link dialog. */
export default async function LinkLinePage({ params }: PageProps) {
  const { token } = await params;
  const user = readUser(await cookies());
  if (!user) redirect(`/login?next=${encodeURIComponent(`/link/line/${token}`)}`);
  const request = linkRequest(token);
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-4 py-12 sm:px-8">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-success/15 text-success">
          <MessageCircle className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-[1.75rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.25rem]">{COPY.title}</h1>
        <section className="flex flex-col gap-4 rounded-3xl border border-border bg-card p-6 shadow-card">
          {request ? (
            <form method="post" action="/api/line-link" className="flex flex-col gap-4">
              <p className="text-sm sm:text-base">{COPY.body(request.identity.name ?? COPY.unknownName, user.nameTh)}</p>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className={cn("inline-flex h-10 w-fit items-center gap-2 rounded-full bg-ink px-4 text-sm font-medium text-ink-foreground transition hover:opacity-90", FOCUS)}>
                <Link2 className="size-4" aria-hidden />
                {COPY.confirm}
              </button>
            </form>
          ) : (
            <p className="text-sm text-muted-foreground sm:text-base">{COPY.expired}</p>
          )}
        </section>
      </div>
    </main>
  );
}
