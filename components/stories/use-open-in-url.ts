"use client";

import { useCallback, useEffect, useState } from "react";

const OPEN = "open";

/** Whether a panel is open, kept in the page's address as `?<param>=open`, so going back to the page after visiting something from the panel opens it again. */
export function useOpenInUrl(param: string): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get(param) === OPEN) setOpen(true);
  }, [param]);
  const change = useCallback(
    (next: boolean) => {
      setOpen(next);
      const url = new URL(window.location.href);
      if (next) url.searchParams.set(param, OPEN);
      else url.searchParams.delete(param);
      window.history.replaceState(window.history.state, "", url);
    },
    [param],
  );
  return [open, change];
}
