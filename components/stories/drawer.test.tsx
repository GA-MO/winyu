import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TH } from "@/lib/i18n/th";
import { StoriesDrawer } from "./drawer";
import { useOpenInUrl } from "./use-open-in-url";

const BRIEF = { at: "2026-10-17T00:58:51.154Z", checkedCount: 4, cards: [] };

let mounted: { root: Root; host: HTMLElement } | null = null;

afterEach(async () => {
  if (mounted) await act(async () => mounted?.root.unmount());
  mounted?.host.remove();
  mounted = null;
  window.history.replaceState(null, "", "/");
});

async function draw(node: React.ReactNode): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  mounted = { root, host };
  await act(async () => root.render(node));
  return host;
}

function Probe({ seen }: { seen: { open: boolean; set: (open: boolean) => void } }) {
  const [open, setOpen] = useOpenInUrl("stories");
  seen.open = open;
  seen.set = setOpen;
  return null;
}

describe("the stories drawer (AI-259)", () => {
  test("offers one close button, named for the drawer, not the bell; the dimmed backdrop closes it on a tap but is not a second close button for a screen reader", async () => {
    const host = await draw(<StoriesDrawer brief={BRIEF} asOf="2026-11-26" open onClose={() => undefined} />);
    const named = [...host.querySelectorAll("button")].filter((button) => button.getAttribute("aria-hidden") !== "true" && (button.getAttribute("aria-label") ?? "").startsWith("ปิด"));
    expect(named.map((button) => button.getAttribute("aria-label"))).toEqual([TH.stories.close]);
    expect(TH.stories.close).not.toBe(TH.notifications.close);
  });

  test("stays open across a visit and back: opening writes it into the address, and the page opens it again from there", async () => {
    const seen = { open: false, set: (_open: boolean) => undefined };
    await draw(<Probe seen={seen} />);
    expect(seen.open).toBe(false);
    await act(async () => seen.set(true));
    expect(window.location.search).toBe("?stories=open");
    await act(async () => mounted?.root.unmount());
    mounted?.host.remove();
    mounted = null;
    const back = { open: false, set: (_open: boolean) => undefined };
    await draw(<Probe seen={back} />);
    expect(back.open).toBe(true);
    await act(async () => back.set(false));
    expect(window.location.search).toBe("");
  });
});
