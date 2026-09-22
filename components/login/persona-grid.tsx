"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

const SESSION_ENDPOINT = "/api/session";
const CARD = "flex w-full flex-col items-start gap-2 rounded-2xl border border-border/70 bg-card/70 p-4 text-left backdrop-blur transition duration-300 hover:-translate-y-0.5 hover:border-primary/50 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const CARD_SHADOW = "shadow-[0_18px_50px_-30px_var(--vexa-glow),0_8px_24px_-18px_var(--vexa-glow-violet)] hover:shadow-[0_28px_70px_-32px_var(--vexa-glow)]";
const CHIP = "rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground";

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
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {users.map((user, index) => (
          <li key={user.id} className="animate-hero-rise" style={{ animationDelay: `${Math.min(index, 12) * 30}ms` }}>
            <button
              type="button"
              onClick={() => signIn(user.id)}
              disabled={pending}
              aria-label={`${TH.login.pick} ${user.nameTh}`}
              className={`${CARD} ${CARD_SHADOW}`}
            >
              <span className="flex w-full items-center gap-2">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-brand-violet text-sm font-semibold text-primary-foreground">
                  {user.nameTh.replace(/^คุณ/, "").slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1 truncate font-medium">{user.nameTh}</span>
              </span>
              <span className="text-sm text-muted-foreground">{user.title}</span>
              <span className="flex flex-wrap gap-1.5">
                <span className={CHIP}>{TH.role[user.role]}</span>
                <span className={CHIP}>{user.region ? TH.region[user.region] : TH.region.all}</span>
              </span>
              {chosen === user.id && pending ? <span className="text-xs text-primary">{TH.login.signingIn}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
