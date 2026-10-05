import type { MetricQuery } from "@/lib/contracts";

/** One finished chat turn to make findable later: who asked, where, the question, the reply text and the metric queries the reply was built from. */
export type RecallTurn = { userId: string; threadId: string; turnId: string; at: string; question: string; reply: string; queries: MetricQuery[] };

/** A past conversation found for a question: its thread, the turn that matched with its numbers masked and its reply cut short, and the queries that turn ran so the model can ask again for current numbers. */
export type RecalledConversation = { threadId: string; title: string; at: string; question: string; reply: string; queries: MetricQuery[]; score: number };

/** Turns text into unit vectors: passages are what gets indexed, a query is what is searched with. */
export type Embedder = { id: string; dimension: number; passages(texts: string[]): Promise<number[][]>; query(text: string): Promise<number[]> };
