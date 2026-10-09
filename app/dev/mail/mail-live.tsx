"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TH } from "@/lib/i18n/th";

const REFRESH_MS = 3000;

/** Re-renders the mail page from the server every few seconds, so mail Winyu writes to the Outbox shows up without a reload. */
export function MailRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [router]);
  return null;
}

/** The mailbox owner picker: choosing a persona opens their inbox. */
export function MailboxPicker({ people, value }: { people: { id: string; nameTh: string; title: string }[]; value: string }) {
  const router = useRouter();
  return (
    <label className="flex min-w-0 items-center gap-2 text-xs">
      <span className="shrink-0 opacity-90">{TH.mailDemo.owner}</span>
      <select
        value={value}
        onChange={(event) => router.push(`/dev/mail?${new URLSearchParams({ as: event.target.value }).toString()}`)}
        className="min-w-0 max-w-64 truncate rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {people.map((person) => (
          <option key={person.id} value={person.id}>
            {person.nameTh} · {person.title}
          </option>
        ))}
      </select>
    </label>
  );
}
