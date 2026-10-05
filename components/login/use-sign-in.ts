"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { TH } from "@/lib/i18n/th";

const SESSION_ENDPOINT = "/api/session";

/** Signs in as a persona and navigates to where that persona should start. */
export function useSignIn() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signIn = (userId: string, destination = "/") => {
    setChosen(userId);
    setError(null);
    startTransition(async () => {
      const response = await fetch(SESSION_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId }) });
      if (!response.ok) {
        setError(TH.login.failed);
        setChosen(null);
        return;
      }
      router.push(destination);
      router.refresh();
    });
  };

  return { signIn, pending, chosen, error };
}
