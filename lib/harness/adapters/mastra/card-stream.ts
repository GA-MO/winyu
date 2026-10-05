import { BlockReader, type BlockEvent } from "@/lib/compose/block";
import { COMPOSED_CARD_ACTIVITY, type ComposedSurface } from "@/lib/compose/catalog";
import { CardComposer, type CardOutcome, type CardSurface } from "@/lib/compose/composer";
import type { TurnResult } from "@/lib/compose/ground";

const SSE_DATA = "data:";
const FRAME_END = "\n\n";
const CARD_ID_SEPARATOR = ":card:";

/** A finished card block as the harness records it: which card, how many lines held, how many were dropped and why. */
export type ComposedCardRecord = { surfaceId: string; accepted: number; rejected: number; problems: string[] };

/** An AG-UI event as the card stream reads and writes it. */
export type StreamEvent = { type?: unknown; messageId?: unknown; delta?: unknown; toolCallId?: unknown; toolCallName?: unknown; content?: unknown } & Record<string, unknown>;

type OpenBlock = { surfaceId: string; composer: CardComposer; shown: string };
type TextState = { reader: BlockReader; block: OpenBlock | null; blocks: number };

function parsedContent(content: unknown): unknown {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

/** The id a composed card travels under: its text message and its place among that message's blocks, the same live and restored. */
export function surfaceIdOf(messageId: string, block: number): string {
  return `${messageId}${CARD_ID_SEPARATOR}${block}`;
}

/** The AG-UI activity that carries a composed card to the chat; each one replaces the card's previous snapshot. */
export function cardActivity(surfaceId: string, surface: CardSurface | null, done: boolean): StreamEvent {
  const content: ComposedSurface = { surfaceId, components: surface?.components ?? [], dataModel: surface?.dataModel ?? {}, done };
  return { type: "ACTIVITY_SNAPSHOT", messageId: surfaceId, activityType: COMPOSED_CARD_ACTIVITY, content, replace: true };
}

/** Takes the card blocks out of a reply's AG-UI events: the person reads the words around a block, each block line is checked against the run's read results as it arrives, and the card that holds so far goes to the chat as an activity snapshot. */
export class ReplyCards {
  private readonly calls = new Map<string, string>();
  private readonly outputs = new Map<string, unknown>();
  private readonly texts = new Map<string, TextState>();

  constructor(
    private readonly composable: (tool: string) => boolean,
    private readonly onCard: (record: ComposedCardRecord) => void,
  ) {}

  /** The events to send in place of one event the agent emitted. */
  next(event: StreamEvent): StreamEvent[] {
    const messageId = typeof event.messageId === "string" ? event.messageId : null;
    const toolCallId = typeof event.toolCallId === "string" ? event.toolCallId : null;
    if (event.type === "RUN_STARTED") this.startRun();
    if (event.type === "TOOL_CALL_START" && toolCallId) this.calls.set(toolCallId, String(event.toolCallName ?? ""));
    if (event.type === "TOOL_CALL_RESULT" && toolCallId) this.outputs.set(toolCallId, parsedContent(event.content));
    if (event.type === "TEXT_MESSAGE_CONTENT" && messageId && typeof event.delta === "string") return this.unchangedOr(event, this.read(messageId, this.stateOf(messageId).reader.push(event.delta)));
    if (event.type === "TEXT_MESSAGE_END" && messageId) return [...this.endText(messageId), event];
    if (event.type === "RUN_FINISHED" || event.type === "RUN_ERROR") return [...[...this.texts.keys()].flatMap((id) => this.endText(id)), event];
    return [event];
  }

  /** The read results the run has returned so far, in the order the agent called them. */
  results(): TurnResult[] {
    return [...this.calls].flatMap(([id, tool]) => (this.outputs.has(id) && this.composable(tool) ? [{ tool, output: this.outputs.get(id) }] : []));
  }

  private startRun(): void {
    this.calls.clear();
    this.outputs.clear();
    this.texts.clear();
  }

  private unchangedOr(event: StreamEvent, out: StreamEvent[]): StreamEvent[] {
    const [only] = out;
    return out.length === 1 && only.type === event.type && only.delta === event.delta ? [event] : out;
  }

  private stateOf(messageId: string): TextState {
    const known = this.texts.get(messageId);
    if (known) return known;
    const state: TextState = { reader: new BlockReader(), block: null, blocks: 0 };
    this.texts.set(messageId, state);
    return state;
  }

  private endText(messageId: string): StreamEvent[] {
    const state = this.texts.get(messageId);
    if (!state) return [];
    this.texts.delete(messageId);
    return this.read(messageId, state.reader.end(), state);
  }

  private read(messageId: string, events: readonly BlockEvent[], state: TextState = this.stateOf(messageId)): StreamEvent[] {
    const out: StreamEvent[] = [];
    let text = "";
    const flushText = () => {
      if (text) out.push({ type: "TEXT_MESSAGE_CONTENT", messageId, delta: text });
      text = "";
    };
    for (const event of events) {
      if (event.kind === "text") {
        text += event.text;
        continue;
      }
      flushText();
      if (event.kind === "open") {
        state.blocks += 1;
        state.block = { surfaceId: surfaceIdOf(messageId, state.blocks), composer: new CardComposer(this.results()), shown: "" };
        continue;
      }
      const block = state.block;
      if (!block) continue;
      if (event.kind === "line") {
        if (block.composer.read(event.line)) out.push(...this.snapshot(block));
        continue;
      }
      out.push(...this.closed(block, block.composer.finish()));
      state.block = null;
    }
    flushText();
    return out;
  }

  private snapshot(block: OpenBlock): StreamEvent[] {
    const surface = block.composer.surface();
    const shown = JSON.stringify(surface);
    if (!surface || shown === block.shown) return [];
    block.shown = shown;
    return [cardActivity(block.surfaceId, surface, false)];
  }

  private closed(block: OpenBlock, outcome: CardOutcome): StreamEvent[] {
    this.onCard({ surfaceId: block.surfaceId, accepted: outcome.accepted, rejected: outcome.rejected, problems: outcome.problems });
    if (!outcome.surface && !block.shown) return [];
    return [cardActivity(block.surfaceId, outcome.surface, true)];
  }
}

function frameEvent(frame: string): StreamEvent | null {
  const line = frame.trim();
  if (!line.startsWith(SSE_DATA) || line.includes("\n")) return null;
  try {
    return JSON.parse(line.slice(SSE_DATA.length)) as StreamEvent;
  } catch {
    return null;
  }
}

function framesOf(events: readonly StreamEvent[]): string {
  return events.map((event) => `${SSE_DATA} ${JSON.stringify(event)}${FRAME_END}`).join("");
}

/** Rewrites an AG-UI event stream so card blocks reach the chat as checked activity snapshots instead of reply text; frames it does not change pass through as they came. */
export function withComposedCards(response: Response, cards: ReplyCards): Response {
  if (!response.body) return response;
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let pending = "";
  const rewrite = (frame: string): string => {
    const event = frameEvent(frame);
    if (!event) return `${frame}${FRAME_END}`;
    const out = cards.next(event);
    return out.length === 1 && out[0] === event ? `${frame}${FRAME_END}` : framesOf(out);
  };
  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      pending += decoder.decode(chunk, { stream: true });
      const frames = pending.split(FRAME_END);
      pending = frames.pop() ?? "";
      const text = frames.map(rewrite).join("");
      if (text) controller.enqueue(encoder.encode(text));
    },
    flush(controller) {
      pending += decoder.decode();
      if (pending) controller.enqueue(encoder.encode(pending.trim() ? rewrite(pending) : pending));
    },
  });
  return new Response(response.body.pipeThrough(transform), { status: response.status, statusText: response.statusText, headers: response.headers });
}
