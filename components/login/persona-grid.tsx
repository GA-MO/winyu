"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

const SESSION_ENDPOINT = "/api/session";
const CARD_SHADOW = "0 12px 32px -18px var(--vexa-glow-soft)";

export function PersonaGrid({ users }: { users: readonly User[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = (userId: string) => {
    setChosen(userId);
    setError(null);
    startTransition(async () => {
      const response = await fetch(SESSION_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
      if (!response.ok) {
        setError(TH.login.failed);
        setChosen(null);
        return;
      }
      router.push("/");
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => signIn(user.id)}
              disabled={pending}
              aria-label={`${TH.login.pick} ${user.nameTh}`}
              className="flex w-full flex-col items-start gap-2 rounded-2xl border border-border bg-card p-4 text-left transition-transform hover:-translate-y-0.5 hover:border-primary disabled:opacity-60"
              style={{ boxShadow: CARD_SHADOW }}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="font-medium">{user.nameTh}</span>
                <span className="rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">{user.region ? TH.region[user.region] : TH.region.all}</span>
              </span>
              <span className="text-sm text-muted-foreground">{user.title}</span>
              <span className="text-xs text-muted-foreground">{user.department}</span>
              {chosen === user.id && pending ? <span className="text-xs text-primary">{TH.login.signingIn}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
