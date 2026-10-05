import { z } from "zod/v3";

/** The fence that opens a composed card in the model's reply; one A2UI component per line follows until the closing fence. */
export const CARD_FENCE = "```a2ui";

/** The AG-UI activity type a composed card travels as, live and restored. */
export const COMPOSED_CARD_ACTIVITY = "mascop-card";

/** The catalog id every composed surface names; the chat registers mascop's renderers under it. */
export const COMPOSE_CATALOG_ID = "mascop";

/** The A2UI protocol version mascop writes and CopilotKit's renderer reads. */
export const A2UI_VERSION = "v0.9";

/** The id A2UI draws a surface from; the composed card's root is sent under it whatever id the model gave it. */
export const ROOT_ID = "root";

/** The write tools a composed button may start, each still behind its approval card; every other button asks a question. */
export const COMPOSE_ACTION_TOOLS = ["enroll_course"] as const;

/** The event a composed row or button sends to ask the chat a follow-up question. */
export const ASK_EVENT = "ask";

const binding = z.object({ path: z.string() });
const text = z.union([z.string(), binding]);
const childList = z.union([z.array(z.string()), z.object({ componentId: z.string(), path: z.string() })]);
const action = z.union([
  z.object({ event: z.object({ name: z.string(), context: z.record(z.union([z.string(), binding])).optional() }) }),
  z.object({ functionCall: z.object({ call: z.string() }) }),
]);
const tone = z.enum(["neutral", "success", "warning", "danger"]);
const badgeList = z.union([z.array(z.object({ label: z.string(), tone: tone.nullish() })), binding]);
const pairList = z.union([z.array(z.object({ label: z.string(), value: z.string() })), binding]);
const rowList = z.union([z.array(z.record(z.unknown())), binding]);

/** Every component a composed card may use, with its props as A2UI binds them: text is a literal or `{ path }` into the turn's tool results; children are ids or a template `{ componentId, path }` repeated per item. */
export const COMPOSE_CATALOG = {
  Card: { props: z.object({ title: text, meta: text.optional(), footnote: z.string().optional(), children: childList }) },
  Section: { props: z.object({ label: z.string(), children: childList }) },
  Grid: { props: z.object({ children: childList }) },
  Carousel: { props: z.object({ children: childList }) },
  ListItem: {
    props: z.object({
      title: text,
      subtitle: text.optional(),
      detail: text.optional(),
      src: text.optional(),
      media: z.enum(["avatar", "thumb", "none"]).optional(),
      badges: badgeList.optional(),
      trailing: text.optional(),
      action: action.optional(),
    }),
  },
  Person: { props: z.object({ name: text, role: text.optional(), src: text.optional() }) },
  KeyValue: { props: z.object({ pairs: z.array(z.object({ label: z.string(), value: text })).optional(), from: pairList.optional() }) },
  Metric: { props: z.object({ label: text, value: text, detail: text.optional() }) },
  Badge: { props: z.object({ label: text, tone: tone.optional() }) },
  Callout: { props: z.object({ title: text, body: text, tone: z.enum(["info", "success", "warning", "danger"]).optional() }) },
  Image: { props: z.object({ src: text, alt: text.optional() }) },
  Table: { props: z.object({ rows: rowList, columns: z.array(z.object({ key: z.string(), label: z.string() })) }) },
  RankList: { props: z.object({ items: rowList, label: z.string(), value: z.string(), note: z.string().optional() }) },
  Button: { props: z.object({ label: text, action, variant: z.enum(["primary", "secondary"]).optional() }) },
};

export type ComponentName = keyof typeof COMPOSE_CATALOG;

export const COMPONENT_NAMES = Object.keys(COMPOSE_CATALOG) as [ComponentName, ...ComponentName[]];

/** One component as the model writes it and A2UI carries it: an id, its catalog name, and its props flat beside them. */
export type ComposedComponent = { id: string; component: ComponentName } & Record<string, unknown>;

/** A2UI v0.9 server-to-client messages: open the surface, send its components, fill its data model. */
export type A2uiMessage =
  | { version: typeof A2UI_VERSION; createSurface: { surfaceId: string; catalogId: string } }
  | { version: typeof A2UI_VERSION; updateComponents: { surfaceId: string; components: ComposedComponent[] } }
  | { version: typeof A2UI_VERSION; updateDataModel: { surfaceId: string; path: string; value: unknown } };

/** A composed card as the chat receives it: the components that hold so far (root first), the data model they read, and whether the model has finished writing it. */
export type ComposedSurface = { surfaceId: string; components: ComposedComponent[]; dataModel: Record<string, unknown>; done: boolean };
