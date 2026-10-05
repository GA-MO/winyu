import { collection } from "@/lib/server/store/json-store";

const COLLECTION = "teams-conversations";

/** Where Winyu can write to a person in Teams without being asked: the 1:1 conversation they last wrote to the bot from (its Chat SDK thread id carries the conversation and service URL). */
export type TeamsConversation = { id: string; threadId: string; at: string };

const conversations = () => collection<TeamsConversation>(COLLECTION);

/** Keeps the private conversation a linked person last wrote from, so a share can reach them there later. */
export function rememberTeamsConversation(userId: string, threadId: string, at: string): void {
  if (conversations().get(userId)?.threadId === threadId) return;
  conversations().put({ id: userId, threadId, at });
}

/** The Teams 1:1 conversation Winyu may post into for this person, or null when they never wrote to the bot privately. */
export function teamsConversationOf(userId: string): TeamsConversation | null {
  return conversations().get(userId);
}
