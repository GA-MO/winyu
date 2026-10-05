import { cookies } from "next/headers";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { redirect } from "next/navigation";
import { ROLE_POLICIES } from "@/lib/access/policies";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";
import { GlowBackdrop } from "@/components/ui/glow-backdrop";
import { GradientText } from "@/components/ui/gradient-text";

const DEV_CARDS = "/dev/cards";
const BANGKOK = "Asia/Bangkok";

type PartOfDay = keyof typeof TH.landing.greeting;

function partOfDay(now: Date): PartOfDay {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: BANGKOK }).format(now));
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  if (hour < 20) return "evening";
  return "night";
}

export const dynamic = "force-dynamic";

/** Placeholder home until the chat lands: the greeting by name, what this persona sees, and a way to every card kind. */
export default async function HomePage() {
  const user = readUser(await cookies());
  if (!user) redirect("/login");
  const scope = ROLE_POLICIES[user.role].regions === "own" ? TH.login.scopeOwn : TH.login.scopeAll;
  return (
    <section className="relative isolate min-h-[calc(100dvh-3.75rem)] overflow-hidden">
      <GlowBackdrop />
      <div className="relative mx-auto flex min-h-[70dvh] max-w-3xl flex-col justify-center gap-5 px-4 py-16 sm:px-8">
        <p className="text-sm text-muted-foreground">{TH.landing.greeting[partOfDay(new Date())]}</p>
        <h1 className="font-display text-[2.25rem] font-semibold leading-[1.15] tracking-[-0.03em] sm:text-[3rem]">
          <GradientText>{user.nameTh}</GradientText>
        </h1>
        <p className="text-base text-muted-foreground">
          {TH.role[user.role]} · {TH.shell.scope(scope)}
        </p>
        <p className="max-w-xl text-sm text-muted-foreground">{TH.shell.chatSoon}</p>
        {process.env.NODE_ENV === "production" ? null : (
          <Link href={DEV_CARDS} className="inline-flex w-fit items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-medium text-ink-foreground transition hover:opacity-90">
            {TH.shell.devCards}
            <ArrowRight className="size-4" aria-hidden />
          </Link>
        )}
      </div>
    </section>
  );
}
