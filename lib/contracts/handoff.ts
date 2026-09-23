import { z } from "zod";
import { metricQuerySchema, type MetricQuery } from "./semantic";

export type ContextPacket = { id: string; fromUserId: string; toUserId: string; title: string; ask: string;
  urgency: "low" | "medium" | "high"; sla: string | null; evidence: MetricQuery[]; alertIds: string[];
  conversationDigest: string; suggestedActions: string[]; status: "open" | "accepted" | "need_info" | "returned" | "resolved";
  outcome: string | null; thread: PacketReply[]; createdAt: string; updatedAt: string };
export type PacketReply = { userId: string; at: string; text: string };
export type Notification = { id: string; userId: string; at: string; kind: "handoff" | "alert" | "reply" | "email"; refId: string; read: boolean; title: string };

export const URGENCIES = ["low", "medium", "high"] as const;
export type Urgency = (typeof URGENCIES)[number];
export const PACKET_STATUSES = ["open", "accepted", "need_info", "returned", "resolved"] as const;

export const urgencySchema = z.enum(URGENCIES);
export const packetReplySchema = z.object({ userId: z.string().min(1), at: z.string(), text: z.string() }) satisfies z.ZodType<PacketReply>;
export const contextPacketSchema = z.object({
  id: z.string().min(1),
  fromUserId: z.string().min(1),
  toUserId: z.string().min(1),
  title: z.string().min(1),
  ask: z.string().min(1),
  urgency: urgencySchema,
  sla: z.string().nullable(),
  evidence: z.array(metricQuerySchema),
  alertIds: z.array(z.string()),
  conversationDigest: z.string(),
  suggestedActions: z.array(z.string()),
  status: z.enum(PACKET_STATUSES),
  outcome: z.string().nullable(),
  thread: z.array(packetReplySchema),
  createdAt: z.string(),
  updatedAt: z.string(),
}) satisfies z.ZodType<ContextPacket>;

export type OutboxEntry = { id: string; at: string; kind: "handoff" | "email"; fromUserId: string; toUserId: string; toEmail: string; subject: string; body: string; refId: string | null };
