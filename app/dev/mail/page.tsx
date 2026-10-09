import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Inbox, Mail, Search, Send } from "lucide-react";
import { cn } from "@/components/ui/cn";
import { USERS, findUser } from "@/lib/data/entities/users";
import { formatDateTh, formatTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { outbox, type OutboxEntry } from "@/lib/server/agent/collections";
import { rewriteMailLinks, type LoopbackPage } from "../loopback-link";
import { mailboxOf, type MailFolder } from "./folders";
import { MailboxPicker, MailRefresh } from "./mail-live";

export const dynamic = "force-dynamic";

const DEFAULT_OWNER = "u_krit";
const FROM_WINYU: ReadonlySet<OutboxEntry["kind"]> = new Set(["watch", "digest"]);
const LINKS_OPEN_A_TAB = '<base target="_blank">';
const FOLDERS: readonly { id: MailFolder; label: string; icon: typeof Inbox }[] = [
  { id: "inbox", label: TH.mailDemo.inbox, icon: Inbox },
  { id: "sent", label: TH.mailDemo.sent, icon: Send },
];
const T = TH.mailDemo;

type SearchParams = Promise<{ as?: string; f?: string; m?: string }>;

function hrefOf(owner: string, folder: MailFolder, mailId?: string): string {
  const query = new URLSearchParams({ as: owner });
  if (folder === "sent") query.set("f", folder);
  if (mailId) query.set("m", mailId);
  return `/dev/mail?${query.toString()}`;
}

function nameOf(userId: string, fallback: string): string {
  return findUser(userId)?.nameTh ?? fallback;
}

function senderOf(entry: OutboxEntry): string {
  return FROM_WINYU.has(entry.kind) ? T.winyu : nameOf(entry.fromUserId, entry.fromUserId);
}

async function pageOf(): Promise<LoopbackPage> {
  const incoming = await headers();
  const host = new URL(`http://${incoming.get("host") ?? "localhost"}`);
  return { protocol: `${incoming.get("x-forwarded-proto") ?? "http"}:`, hostname: host.hostname, port: host.port };
}

function MessageRow({ entry, folder, owner, selected }: { entry: OutboxEntry; folder: MailFolder; owner: string; selected: boolean }) {
  const who = folder === "sent" ? nameOf(entry.toUserId, entry.toEmail) : senderOf(entry);
  return (
    <li>
      <Link
        href={hrefOf(owner, folder, entry.id)}
        aria-current={selected ? "true" : undefined}
        className={cn("flex flex-col gap-0.5 border-b border-border border-l-4 px-4 py-3 text-sm transition", selected ? "border-l-mail bg-mail-selected" : "border-l-transparent hover:bg-mail-surface")}
      >
        <span className="flex items-baseline gap-2">
          <span className="min-w-0 flex-1 truncate font-semibold">{who}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{formatTimeTh(entry.at)}</span>
        </span>
        <span className="truncate text-mail">{entry.subject}</span>
        <span className="truncate text-xs text-muted-foreground">{formatDateTh(entry.at)}</span>
      </Link>
    </li>
  );
}

function ReadingPane({ entry, page, owner }: { entry: OutboxEntry; page: LoopbackPage; owner: string }) {
  return (
    <article className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
      <h2 className="text-xl font-semibold tracking-tight">{entry.subject}</h2>
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-mail text-sm font-semibold text-mail-foreground">{senderOf(entry).slice(0, 1)}</span>
        <dl className="min-w-0 flex-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{T.from}</dt>
            <dd className="truncate font-semibold">{senderOf(entry)}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted-foreground">{T.to}</dt>
            <dd className="truncate">
              {nameOf(entry.toUserId, entry.toEmail)} &lt;{entry.toEmail}&gt;
            </dd>
          </div>
        </dl>
        <time dateTime={entry.at} className="shrink-0 text-xs text-muted-foreground">
          {formatDateTh(entry.at)} {formatTimeTh(entry.at)}
        </time>
      </div>
      {entry.html ? (
        <iframe title={entry.subject} srcDoc={`${LINKS_OPEN_A_TAB}${rewriteMailLinks(entry.html, page, owner)}`} sandbox="allow-popups allow-popups-to-escape-sandbox" className="min-h-[32rem] w-full flex-1 rounded-md border border-border bg-card" />
      ) : (
        <p className="whitespace-pre-wrap text-sm">{entry.body}</p>
      )}
    </article>
  );
}

/** Development only, always light: the persona's mail as an Outlook-style client over the demo Outbox, where a link into Winyu opens a new tab signed in as that persona. */
export default async function DevMailPage({ searchParams }: { searchParams: SearchParams }) {
  if (process.env.NODE_ENV === "production") notFound();
  const params = await searchParams;
  const owner = findUser(params.as ?? "")?.id ?? DEFAULT_OWNER;
  const folder: MailFolder = params.f === "sent" ? "sent" : "inbox";
  const mailbox = mailboxOf(outbox().all(), owner);
  const messages = mailbox[folder];
  const selected = messages.find((entry) => entry.id === params.m) ?? messages[0] ?? null;
  const page = await pageOf();

  return (
    <main className="theme-light flex h-dvh flex-col bg-mail-surface text-foreground">
      <MailRefresh />
      <header className="flex items-center gap-4 bg-mail px-4 py-2 text-mail-foreground">
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Mail className="size-5" aria-hidden />
          {T.title}
        </span>
        <span className="mx-auto hidden max-w-md flex-1 items-center gap-2 rounded-md bg-card/90 px-3 py-1 text-xs text-muted-foreground md:flex">
          <Search className="size-3.5" aria-hidden />
          Search
        </span>
        <Link href="/dev/channels" className="text-xs underline-offset-2 hover:underline">
          {T.channelsLink}
        </Link>
        <MailboxPicker people={USERS.map(({ id, nameTh, title }) => ({ id, nameTh, title }))} value={owner} />
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="hidden w-56 shrink-0 flex-col gap-1 p-3 sm:flex">
          {FOLDERS.map(({ id, label, icon: Icon }) => (
            <Link
              key={id}
              href={hrefOf(owner, id)}
              aria-current={id === folder ? "page" : undefined}
              className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm", id === folder ? "bg-mail-selected font-semibold" : "hover:bg-card")}
            >
              <Icon className="size-4 text-mail" aria-hidden />
              <span className="flex-1">{label}</span>
              <span className="text-xs text-muted-foreground">{mailbox[id].length}</span>
            </Link>
          ))}
          <p className="mt-auto px-3 text-[11px] leading-relaxed text-muted-foreground">{T.note}</p>
        </nav>
        <section className="flex w-80 shrink-0 flex-col border-x border-border bg-card lg:w-96">
          <h1 className="border-b border-border px-4 py-3 text-base font-semibold">{folder === "sent" ? T.sent : T.inbox}</h1>
          {messages.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{T.emptyFolder}</p> : null}
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {messages.map((entry) => (
              <MessageRow key={entry.id} entry={entry} folder={folder} owner={owner} selected={entry.id === selected?.id} />
            ))}
          </ul>
        </section>
        <section className="flex min-w-0 flex-1 flex-col bg-card">
          {selected ? <ReadingPane entry={selected} page={page} owner={owner} /> : <p className="m-auto text-sm text-muted-foreground">{T.pickMail}</p>}
          <p className="border-t border-border px-6 py-2 text-xs text-muted-foreground">{T.opensAs(nameOf(owner, owner))}</p>
        </section>
      </div>
    </main>
  );
}
