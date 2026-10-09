import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { TH } from "@/lib/i18n/th";
import { WaitingPill } from "./waiting-pill";

describe("the waiting pill", () => {
  test("links to the Inbox with its count, and is absent when nothing waits", () => {
    const html = renderToStaticMarkup(<WaitingPill count={2} />);
    expect(html).toContain('href="/?inbox"');
    expect(html).toContain(`${TH.notifications.decide}</span><span class="font-semibold tabular-nums">2`);
    expect(renderToStaticMarkup(<WaitingPill count={0} />)).toBe("");
  });
});
