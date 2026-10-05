"use client";

import type { FormEvent, ReactNode } from "react";

function submitOnChange(event: FormEvent<HTMLFormElement>) {
  event.currentTarget.requestSubmit();
}

/** A GET filter form that applies as soon as any of its fields changes, so there is no separate apply button. */
export function AutoSubmitForm({ action, className, children }: { action: string; className?: string; children: ReactNode }) {
  return (
    <form action={action} className={className} onChange={submitOnChange}>
      {children}
    </form>
  );
}
