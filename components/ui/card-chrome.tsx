"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Forward, HelpCircle, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "./cn";
import { TH } from "@/lib/i18n/th";

const SHARE_STYLES = ["a", "b", "c"] as const;
const DEFAULT_SHARE_STYLE: ShareStyle = "a";
const SHARE_STYLE_PARAM = "shareStyle";
const SHARE_STYLE_KEY = "winyu.shareStyle";

const ICON_BUTTON = "group/btn relative inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-expanded:bg-muted aria-expanded:text-foreground";
const TOOLTIP = "pointer-events-none absolute right-0 top-full z-30 mt-1 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium text-ink-foreground opacity-0 shadow-lift transition group-hover/btn:opacity-100 group-focus-visible/btn:opacity-100";
const MENU_ITEM = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-foreground transition hover:bg-muted focus-visible:bg-muted focus-visible:outline-none [&>svg]:size-4 [&>svg]:text-muted-foreground";
const FOOTER_PILL = "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-foreground/25 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** Prototype switch for where a card's ส่งต่อ lives: a = header icon, b = footer pill, c = header ⋯ menu. */
export type ShareStyle = (typeof SHARE_STYLES)[number];

/** One card action the chrome can draw; `menuOnly` keeps it out of the header icon row (variant a). */
export type CardChromeAction = { id: string; label: string; icon: LucideIcon; run: () => void; menuOnly?: boolean };

/** What the surface hands its outermost card: the share action, the other card actions, and why the card is here. */
export type CardChrome = { share: (() => void) | null; shareLabel: string; actions: CardChromeAction[]; note: string | null };

const CardChromeContext = createContext<CardChrome | null>(null);

/** Gives the next `Card` inside its actions; the card hands its own children none, so nested cards stay bare. */
export function CardChromeProvider({ value, children }: { value: CardChrome | null; children: ReactNode }) {
  return <CardChromeContext.Provider value={value}>{children}</CardChromeContext.Provider>;
}

export function useCardChrome(): CardChrome | null {
  return useContext(CardChromeContext);
}

function isShareStyle(value: string | null): value is ShareStyle {
  return value !== null && (SHARE_STYLES as readonly string[]).includes(value);
}

function readShareStyle(): ShareStyle {
  const fromUrl = new URLSearchParams(window.location.search).get(SHARE_STYLE_PARAM);
  if (isShareStyle(fromUrl)) {
    try {
      window.sessionStorage.setItem(SHARE_STYLE_KEY, fromUrl);
    } catch {}
    return fromUrl;
  }
  try {
    const stored = window.sessionStorage.getItem(SHARE_STYLE_KEY);
    return isShareStyle(stored) ? stored : DEFAULT_SHARE_STYLE;
  } catch {
    return DEFAULT_SHARE_STYLE;
  }
}

const noSubscription = () => () => undefined;

/** The prototype's share style from `?shareStyle=a|b|c`, remembered for the tab. */
export function useShareStyle(): ShareStyle {
  return useSyncExternalStore(noSubscription, readShareStyle, () => DEFAULT_SHARE_STYLE);
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={ICON_BUTTON}>
      <Icon className="size-4" aria-hidden />
      <span aria-hidden className={TOOLTIP}>{label}</span>
    </button>
  );
}

function NoteButton({ note }: { note: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative">
      <button type="button" aria-label={TH.dash.why} aria-expanded={open} onClick={() => setOpen((value) => !value)} onBlur={() => setOpen(false)} className={ICON_BUTTON}>
        <HelpCircle className="size-4" aria-hidden />
        {open ? null : <span aria-hidden className={TOOLTIP}>{TH.dash.why}</span>}
      </button>
      {open ? (
        <span role="tooltip" className="absolute right-0 top-9 z-30 flex w-64 flex-col gap-1 rounded-xl border border-border bg-card p-3 text-xs shadow-lift">
          <span className="font-medium">{TH.dash.why}</span>
          <span className="text-muted-foreground">{note}</span>
        </span>
      ) : null}
    </span>
  );
}

function HeaderIcons({ chrome }: { chrome: CardChrome }) {
  const shown = chrome.actions.filter((action) => !action.menuOnly);
  return (
    <div className="-mr-1.5 -mt-1.5 flex shrink-0 items-center transition pointer-fine:opacity-0 pointer-fine:group-hover/card:opacity-100 pointer-fine:group-focus-within/card:opacity-100">
      {chrome.share ? <IconButton label={TH.share.button} icon={Forward} onClick={chrome.share} /> : null}
      {chrome.note ? <NoteButton note={chrome.note} /> : null}
      {shown.map((action) => (
        <IconButton key={action.id} label={action.label} icon={action.icon} onClick={action.run} />
      ))}
    </div>
  );
}

function OverflowMenu({ chrome }: { chrome: CardChrome }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const pick = (run: () => void) => {
    setOpen(false);
    run();
  };
  return (
    <div ref={root} className="relative -mr-1.5 -mt-1.5 shrink-0">
      <button type="button" aria-label={TH.share.cardMenu} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)} className={ICON_BUTTON}>
        <MoreHorizontal className="size-4" aria-hidden />
      </button>
      {open ? (
        <div role="menu" className="absolute right-0 top-9 z-30 flex w-60 flex-col rounded-xl border border-border bg-card p-1 shadow-lift animate-hero-rise">
          {chrome.share ? (
            <button type="button" role="menuitem" onClick={() => pick(chrome.share ?? (() => undefined))} className={MENU_ITEM}>
              <Forward aria-hidden />
              <span className="flex flex-col">
                {TH.share.button}
                <span className="text-[11px] text-muted-foreground">{TH.share.menuHint}</span>
              </span>
            </button>
          ) : null}
          {chrome.actions.map((action) => (
            <button key={action.id} type="button" role="menuitem" onClick={() => pick(action.run)} className={MENU_ITEM}>
              <action.icon aria-hidden />
              {action.label}
            </button>
          ))}
          {chrome.note ? (
            <p className="mt-1 border-t border-border px-2.5 pb-1.5 pt-2 text-[11px] leading-relaxed text-muted-foreground">
              <span className="font-medium text-foreground/80">{TH.dash.why}</span> {chrome.note}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The card header's right slot: icons in variant a, the ⋯ menu in variant c, nothing in b. */
export function CardHeaderChrome() {
  const chrome = useCardChrome();
  const style = useShareStyle();
  if (!chrome) return null;
  if (style === "a") return <HeaderIcons chrome={chrome} />;
  if (style === "c") return <OverflowMenu chrome={chrome} />;
  return null;
}

/** The card's closing source line, with the ส่งต่อ pill beside it in variant b. */
export function CardFootnote({ footnote }: { footnote: string | null | undefined }) {
  const chrome = useCardChrome();
  const style = useShareStyle();
  const pill = style === "b" && chrome?.share ? chrome.share : null;
  if (!footnote && !pill) return null;
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-2.5">
      <p className="min-w-0 flex-1 text-[11px] leading-normal text-muted-foreground/80">{footnote}</p>
      {pill && chrome ? (
        <button type="button" onClick={pill} aria-label={chrome.shareLabel} className={FOOTER_PILL}>
          <Forward className="size-3.5" aria-hidden />
          {TH.share.button}
        </button>
      ) : null}
    </div>
  );
}

/** Whether the dashboard keeps its floating toolbar beside the card (variant b) instead of handing its actions to the card. */
export function useFloatingCardActions(): boolean {
  return useShareStyle() === "b";
}
