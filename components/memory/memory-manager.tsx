"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Check, History, MessageSquare, MousePointerClick, Pencil, Search, Trash2, X } from "lucide-react";
import { cn } from "@/components/ui/cn";
import type { MemoryFact } from "@/lib/contracts";
import type { MemoryStatus } from "@/lib/engine/memory-status";
import { relativeTimeTh } from "@/lib/i18n/format";
import { TH } from "@/lib/i18n/th";
import { PILL } from "@/components/landing/pill";

const MEMORY_ENDPOINT = "/api/memory";
const CONVERSATIONS_ENDPOINT = `${MEMORY_ENDPOINT}/conversations`;
const MIN_VALUE_LENGTH = 3;
const TYPE_ORDER: MemoryFact["type"][] = ["interest", "vocabulary", "preference", "responsibility", "seasonal"];
const ICON_BUTTON = "rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CARD = "rounded-2xl border border-border bg-card shadow-card";

export type MemoryRow = {
  id: string;
  type: MemoryFact["type"];
  value: string;
  status: MemoryStatus;
  seen: number;
  lastSeenAt: string;
  threadId: string | null;
  fromAction: boolean;
};

/** A conversation recall can search, as the memory page lists it. */
export type RecallRow = { threadId: string; title: string; turns: number; lastAt: string };

type TypeFilter = MemoryFact["type"] | "all";

function typeLabel(type: MemoryFact["type"]): string {
  return TH.account.memoryType[type] ?? type;
}

function matches(row: MemoryRow, query: string, type: TypeFilter): boolean {
  if (type !== "all" && row.type !== type) return false;
  return query.length === 0 || row.value.toLowerCase().includes(query);
}

/** The memory page body: facts still being learned asked one by one, known facts searchable and editable, the conversations recall can search each removable, and a clear-all that confirms in place. */
export function MemoryManager({ initial, conversations: initialConversations }: { initial: MemoryRow[]; conversations: RecallRow[] }) {
  const [rows, setRows] = useState(initial);
  const [conversations, setConversations] = useState(initialConversations);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [clearing, setClearing] = useState(false);

  const learning = rows.filter((row) => row.status === "learning");
  const known = rows.filter((row) => row.status !== "learning");
  const needle = query.trim().toLowerCase();
  const visible = known.filter((row) => matches(row, needle, type));
  const typesPresent = TYPE_ORDER.filter((item) => known.some((row) => row.type === item));
  const grouped = TYPE_ORDER.map((item) => ({ type: item, items: visible.filter((row) => row.type === item) })).filter((group) => group.items.length > 0);

  const replace = (next: MemoryRow) => setRows((current) => current.map((row) => (row.id === next.id ? next : row)));
  const drop = (id: string) => setRows((current) => current.filter((row) => row.id !== id));

  const keep = async (row: MemoryRow) => {
    replace({ ...row, status: "confirmed" });
    await fetch(`${MEMORY_ENDPOINT}/${row.id}`, { method: "PATCH" });
  };

  const forget = async (id: string) => {
    drop(id);
    await fetch(`${MEMORY_ENDPOINT}/${id}`, { method: "DELETE" });
  };

  const rewrite = async (row: MemoryRow, value: string) => {
    replace({ ...row, value, status: "confirmed" });
    await fetch(`${MEMORY_ENDPOINT}/${row.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ value }) });
  };

  const unrecall = async (threadId: string) => {
    setConversations((current) => current.filter((row) => row.threadId !== threadId));
    await fetch(`${CONVERSATIONS_ENDPOINT}/${encodeURIComponent(threadId)}`, { method: "DELETE" });
  };

  const clearAll = async () => {
    setRows([]);
    setConversations([]);
    setClearing(false);
    await fetch(MEMORY_ENDPOINT, { method: "DELETE" });
  };

  if (rows.length === 0 && conversations.length === 0) return <p className="text-sm text-muted-foreground">{TH.memoryPage.empty}</p>;

  return (
    <div className="flex flex-col gap-8">
      {learning.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="memory-learning">
          <div className="flex flex-col gap-0.5">
            <h2 id="memory-learning" className="text-sm font-semibold tracking-tight">{TH.memoryPage.learningTitle(learning.length)}</h2>
            <p className="text-xs text-muted-foreground">{TH.memoryPage.learningNote}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {learning.map((row) => (
              <LearningCard key={row.id} row={row} onYes={() => void keep(row)} onNo={() => void forget(row.id)} />
            ))}
          </div>
        </section>
      ) : null}

      {known.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="memory-known">
          <h2 id="memory-known" className="text-sm font-semibold tracking-tight">{TH.memoryPage.knownTitle(known.length)}</h2>
          <label className="flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-2 shadow-card">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={TH.memoryPage.search}
              aria-label={TH.memoryPage.search}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={TH.memoryPage.allTypes}>
            {(["all", ...typesPresent] as TypeFilter[]).map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={type === item}
                onClick={() => setType(item)}
                className={cn(PILL, "py-1.5", type === item ? "border-transparent bg-foreground text-background hover:text-background" : "")}
              >
                {item === "all" ? TH.memoryPage.allTypes : typeLabel(item)}
              </button>
            ))}
          </div>
          {grouped.length === 0 ? <p className="text-sm text-muted-foreground">{TH.memoryPage.noMatch}</p> : null}
          {grouped.map((group) => (
            <div key={group.type} className="flex flex-col gap-1.5">
              <h3 className="px-1 text-xs font-medium tracking-wide text-muted-foreground">{typeLabel(group.type)}</h3>
              <ul className={cn(CARD, "divide-y divide-border")}>
                {group.items.map((row) => (
                  <KnownRow key={row.id} row={row} onSave={(value) => void rewrite(row, value)} onForget={() => void forget(row.id)} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}

      {conversations.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="memory-recall">
          <div className="flex flex-col gap-0.5">
            <h2 id="memory-recall" className="text-sm font-semibold tracking-tight">{TH.memoryPage.recallTitle(conversations.length)}</h2>
            <p className="text-xs text-muted-foreground">{TH.memoryPage.recallNote}</p>
          </div>
          <ul className={cn(CARD, "divide-y divide-border")}>
            {conversations.map((row) => (
              <RecallItem key={row.threadId} row={row} onRemove={() => void unrecall(row.threadId)} />
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {clearing ? (
          <>
            <span className="text-sm text-danger">{TH.memoryPage.clearAsk(rows.length + conversations.length)}</span>
            <button type="button" onClick={() => void clearAll()} className={cn(PILL, "border-danger/40 text-danger hover:border-danger hover:text-danger")}>
              {TH.memoryPage.clearConfirm}
            </button>
            <button type="button" onClick={() => setClearing(false)} className={PILL}>
              {TH.memoryPage.cancel}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setClearing(true)} className="text-xs text-muted-foreground underline-offset-4 hover:text-danger hover:underline">
            {TH.memoryPage.clearAll}
          </button>
        )}
      </footer>
    </div>
  );
}

function RecallItem({ row, onRemove }: { row: RecallRow; onRemove: () => void }) {
  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <History className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <Link href={`/c/${row.threadId}`} className="truncate text-sm leading-relaxed hover:underline">
          {row.title}
        </Link>
        <span className="text-xs text-muted-foreground">{TH.memoryPage.recallTurns(row.turns, relativeTimeTh(row.lastAt))}</span>
      </div>
      <button type="button" onClick={onRemove} aria-label={TH.memoryPage.recallRemove} title={TH.memoryPage.recallRemove} className={cn(ICON_BUTTON, "shrink-0 hover:text-danger")}>
        <X className="size-3.5" aria-hidden />
      </button>
    </li>
  );
}

function LearningCard({ row, onYes, onNo }: { row: MemoryRow; onYes: () => void; onNo: () => void }) {
  return (
    <article className={cn(CARD, "flex flex-col gap-3 p-4")}>
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground">{typeLabel(row.type)}</span>
        <p className="text-sm leading-relaxed">{row.value}</p>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={onYes} className={cn(PILL, "py-1.5 text-foreground")}>
          <Check className="size-3.5 text-success" aria-hidden />
          {TH.memoryPage.yes}
        </button>
        <button type="button" onClick={onNo} className={cn(PILL, "py-1.5")}>
          <X className="size-3.5" aria-hidden />
          {TH.memoryPage.no}
        </button>
        {row.threadId ? <SourceLink threadId={row.threadId} className="ml-auto" /> : null}
      </div>
    </article>
  );
}

function SourceLink({ threadId, className }: { threadId: string; className?: string }) {
  return (
    <Link href={`/c/${threadId}`} className={cn("inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground", className)}>
      <MessageSquare className="size-3.5" aria-hidden />
      {TH.memoryPage.fromThread}
    </Link>
  );
}

function Provenance({ row }: { row: MemoryRow }) {
  if (row.status === "confirmed") {
    return (
      <span className="inline-flex items-center gap-1 text-success">
        <BadgeCheck className="size-3.5" aria-hidden />
        {TH.memoryPage.confirmed}
      </span>
    );
  }
  if (row.fromAction) {
    return (
      <span className="inline-flex items-center gap-1">
        <MousePointerClick className="size-3.5" aria-hidden />
        {TH.memoryPage.fromAction}
      </span>
    );
  }
  return <span>{TH.memoryPage.seen(row.seen, relativeTimeTh(row.lastSeenAt))}</span>;
}

function KnownRow({ row, onSave, onForget }: { row: MemoryRow; onSave: (value: string) => void; onForget: () => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const tooShort = draft !== null && draft.trim().length < MIN_VALUE_LENGTH;

  const save = () => {
    if (draft === null || tooShort) return;
    if (draft.trim() !== row.value) onSave(draft.trim());
    setDraft(null);
  };

  if (draft !== null) {
    return (
      <li className="flex flex-col gap-2 px-4 py-3">
        <textarea
          value={draft}
          autoFocus
          rows={2}
          maxLength={120}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              save();
            }
            if (event.key === "Escape") setDraft(null);
          }}
          aria-label={TH.memoryPage.edit}
          className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-foreground/25"
        />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={tooShort} className={cn(PILL, "py-1.5 text-foreground")}>
            {TH.memoryPage.save}
          </button>
          <button type="button" onClick={() => setDraft(null)} className={cn(PILL, "py-1.5")}>
            {TH.memoryPage.cancel}
          </button>
          {tooShort ? <span className="text-xs text-danger">{TH.memoryPage.editTooShort}</span> : null}
        </div>
      </li>
    );
  }

  return (
    <li className="group flex items-start gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm leading-relaxed">{row.value}</p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <Provenance row={row} />
          {row.threadId ? <SourceLink threadId={row.threadId} /> : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-0.5 sm:opacity-0 sm:transition sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
        <button type="button" onClick={() => setDraft(row.value)} aria-label={TH.memoryPage.edit} title={TH.memoryPage.edit} className={ICON_BUTTON}>
          <Pencil className="size-3.5" aria-hidden />
        </button>
        <button type="button" onClick={onForget} aria-label={TH.memoryPage.forget} title={TH.memoryPage.forget} className={cn(ICON_BUTTON, "hover:text-danger")}>
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
}
