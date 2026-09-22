"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import type { User } from "@/lib/contracts";
import { TH } from "@/lib/i18n/th";

const SESSION_ENDPOINT = "/api/session";

async function signInAs(userId: string) {
  await fetch(SESSION_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
}

async function signOut() {
  await fetch(SESSION_ENDPOINT, { method: "DELETE" });
}

export function PersonaSwitcher({ current, users }: { current: User; users: readonly User[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const choose = (userId: string) => {
    setOpen(false);
    startTransition(async () => {
      await signInAs(userId);
      router.refresh();
    });
  };

  const leave = () => {
    setOpen(false);
    startTransition(async () => {
      await signOut();
      router.push("/login");
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        disabled={pending}
        className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted disabled:opacity-60"
      >
        <span className="flex size-6 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground">{current.nameTh.replace(/^คุณ/, "").slice(0, 1)}</span>
        <span className="flex flex-col items-start leading-tight">
          <span className="font-medium">{current.nameTh}</span>
          <span className="text-xs text-muted-foreground">{TH.role[current.role]}</span>
        </span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-2 max-h-96 w-72 overflow-y-auto rounded-xl border border-border bg-card p-1" style={{ boxShadow: "0 16px 40px -16px var(--vexa-glow-soft)" }}>
          <p className="px-3 py-2 text-xs font-medium text-muted-foreground">{TH.topbar.switchPersona}</p>
          {users.map((user) => (
            <button
              key={user.id}
              type="button"
              onClick={() => choose(user.id)}
              className={`flex w-full flex-col items-start rounded-lg px-3 py-2 text-left text-sm hover:bg-muted ${user.id === current.id ? "bg-secondary" : ""}`}
            >
              <span>{user.nameTh}</span>
              <span className="text-xs text-muted-foreground">{user.title}</span>
            </button>
          ))}
          <button type="button" onClick={leave} className="mt-1 flex w-full items-center gap-2 rounded-lg border-t border-border px-3 py-2 text-sm text-danger hover:bg-muted">
            <LogOut className="size-4" aria-hidden />
            {TH.topbar.signOut}
          </button>
        </div>
      ) : null}
    </div>
  );
}
