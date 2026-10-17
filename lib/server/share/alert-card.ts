import { liveAccessFor } from "@/lib/access/enforce";
import { labelsNamedIn } from "@/lib/cards/asked";
import { alertRowOf } from "@/lib/cards/alert-row";
import { alertHeroOf, alertPlaceOf, leadingAlertOf, type CardHero } from "@/lib/cards/present";
import { getAlertsInputSchema, type AlertRow, type User } from "@/lib/contracts";
import type { CardFocus, SharedCard } from "@/lib/share/card";
import { loadDictionary } from "@/lib/server/master-data";
import { alertsShown } from "@/lib/server/tools/get-alerts";

const ALERTS_READ = "get_alerts";
const FIGURE_SEPARATOR = " · ";

/** Every anomaly read of the card run again under this person's access, the way get_alerts reads it for them, as the rows the card draws, in the card's order; a read that no longer parses or places its slice shows nothing. No model call, no audit row. */
export async function cardAlerts(card: SharedCard, viewer: User): Promise<AlertRow[]> {
  if (!card.reads.some((read) => read.tool === ALERTS_READ)) return [];
  const dictionary = await loadDictionary();
  const access = liveAccessFor(viewer);
  return card.reads.flatMap((read) => {
    const parsed = read.tool === ALERTS_READ ? getAlertsInputSchema.safeParse(read.input) : null;
    if (!parsed?.success) return [];
    const shown = alertsShown(access, parsed.data, parsed.data.dims ?? {}, dictionary);
    return shown.ok ? shown.alerts.map((alert) => alertRowOf(alert, dictionary)) : [];
  });
}

/** One alert in words a reply or an inbox row can quote: "อีสานรุ่งโรจน์ ค้าส่ง · ปริมาณขายเข้า −89%". */
export function alertWords(alert: AlertRow): string {
  const hero = alertHeroOf(alert);
  return `${hero.label} ${hero.value}`;
}

/** The figure of several alerts: the first one's hero, the others' words after its numbers. */
function alertsFigure(alerts: readonly AlertRow[]): CardHero | null {
  const [first, ...rest] = alerts;
  if (!first) return null;
  const hero = alertHeroOf(first);
  return rest.length === 0 ? hero : { ...hero, detail: [hero.detail, ...rest.map(alertWords)].filter(Boolean).join(FIGURE_SEPARATOR) };
}

/** The anomaly card's headline for this person: the alert it leads with, in words; null when it shows none. */
export async function alertCardHero(card: SharedCard, viewer: User, focus: readonly string[] = []): Promise<string | null> {
  const alerts = await cardAlerts(card, viewer);
  const named = alerts.filter((alert) => focus.includes(alertPlaceOf(alert)));
  const leading = named.length > 0 ? leadingOfEach(named, focus) : [leadingAlertOf(alerts)].flatMap((alert) => alert ?? []);
  return leading.length > 0 ? leading.map(alertWords).join(FIGURE_SEPARATOR) : null;
}

function leadingOfEach(alerts: readonly AlertRow[], places: readonly string[]): AlertRow[] {
  return places.flatMap((place) => leadingAlertOf(alerts.filter((alert) => alertPlaceOf(alert) === place)) ?? []);
}

/** The places of an anomaly card the first of `texts` that names any singles out (the agents an ask names on the region's anomaly list), with each one's leading alert as the figure; null when none names a place. */
export function alertFocusIn(alerts: readonly AlertRow[], texts: readonly string[]): CardFocus | null {
  const places = [...new Set(alerts.map(alertPlaceOf))];
  const labels = texts.map((text) => labelsNamedIn(text, places)).find((named) => named.length > 0);
  if (!labels) return null;
  const leading = leadingOfEach(alerts, labels);
  return { labels, hero: leading.map(alertWords).join(FIGURE_SEPARATOR), figure: alertsFigure(leading), row: null, claim: null };
}
