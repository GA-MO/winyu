import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { cn } from "@/components/ui/cn";
import { TH } from "@/lib/i18n/th";
import { readUser } from "@/lib/server/session";
import { DirectionA } from "./direction-a";
import { DirectionB } from "./direction-b";
import { DirectionC } from "./direction-c";
import { DirectionD } from "./direction-d";
import { momentsFor, VIEWERS, viewerPerson, type ViewerId } from "./fixtures";
import type { Shell } from "./frame";
import { bellCount, hasUnreadUpdate, type NotifyItem } from "./items";
import { ThemeScope } from "./theme-scope";

export const dynamic = "force-dynamic";

const PATH = "/dev/notify-ui";
const COPY = TH.notifyUi;
const DIRECTIONS = [
  { id: "a", Draw: DirectionA },
  { id: "d", Draw: DirectionD },
  { id: "b", Draw: DirectionB },
  { id: "c", Draw: DirectionC },
] as const;

type SearchParams = Promise<{ theme?: string; viewer?: string }>;

function viewerFrom(requested: string | undefined, signedIn: string): ViewerId {
  return VIEWERS.find((id) => id === requested) ?? VIEWERS.find((id) => id === signedIn) ?? VIEWERS[0];
}

/** Development only: four ways (D combines the other three) to tell someone what arrived for them, each drawn at real size in four moments for a sales rep or the CEO. */
export default async function DevNotifyUiPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") notFound();
  const user = readUser(await cookies());
  if (!user) redirect(`/login?next=${PATH}`);
  const { theme, viewer: requested } = await searchParams;
  const viewer = viewerFrom(requested, user.id);
  const person = viewerPerson(viewer);
  const moments = momentsFor(viewer, new Date());
  const shell = (items: NotifyItem[]): Shell => ({ viewer: person, bell: bellCount(items), sharedDot: hasUnreadUpdate(items) });
  const header = (
    <>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{COPY.title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{COPY.subtitle(person.name)}</p>
      <nav aria-label={COPY.viewer} className="mt-3 flex items-center gap-1 text-xs">
        <span className="mr-1 text-muted-foreground">{COPY.viewer}</span>
        {VIEWERS.map((id) => (
          <a
            key={id}
            href={`${PATH}?viewer=${id}${theme === "dark" ? "&theme=dark" : ""}`}
            aria-current={id === viewer ? "page" : undefined}
            className={cn("rounded-full px-3 py-1 transition", id === viewer ? "bg-bubble font-medium text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
          >
            {viewerPerson(id).name}
          </a>
        ))}
      </nav>
    </>
  );

  return (
    <ThemeScope initial={theme === "dark" ? "dark" : "light"} header={header}>
      <main className="mx-auto grid max-w-[122rem] grid-cols-1 justify-center gap-8 px-4 pb-16 sm:px-6 lg:grid-cols-[repeat(2,28rem)] min-[122rem]:grid-cols-[repeat(4,28rem)]">
        {DIRECTIONS.map(({ id, Draw }) => (
          <section key={id} aria-labelledby={`direction-${id}`} className="mx-auto flex w-full max-w-[28rem] flex-col gap-6">
            <header className="flex flex-col gap-0.5 border-b border-border pb-3">
              <h2 id={`direction-${id}`} className="font-display text-lg font-semibold tracking-tight">
                {COPY.directions[id].name}
              </h2>
              <p className="min-h-10 text-sm text-muted-foreground">{COPY.directions[id].idea}</p>
            </header>
            <Draw moments={moments} shell={shell} />
          </section>
        ))}
      </main>
    </ThemeScope>
  );
}
