"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

const READ_ENDPOINT = "/api/notifications";

/** A link that reads its notification as it opens; `notificationId` is null when there is nothing to read. */
export function ReadingLink({ notificationId, onClick, ...link }: ComponentProps<typeof Link> & { notificationId: string | null }) {
  return (
    <Link
      {...link}
      onClick={(event) => {
        if (notificationId) void fetch(READ_ENDPOINT, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: notificationId }), keepalive: true }).catch(() => undefined);
        onClick?.(event);
      }}
    />
  );
}
