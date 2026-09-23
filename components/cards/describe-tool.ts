"use client";

import type { DescribeToolCall, ToolCallDescription } from "vexa/react";
import { ROLE_IDS, type RoleId } from "@/lib/contracts";
import { findUser } from "@/lib/data/entities/users";
import { TH } from "@/lib/i18n/th";

type Recipient = { toUserId?: string };
type Job = { job?: string };

function nameOf(userId: string | undefined): string {
  if (!userId) return "";
  return findUser(userId)?.nameTh ?? userId;
}

function jobOf(input: Job): string {
  const job = String(input.job ?? "");
  return TH.approve.jobs[job] ?? job;
}

function roleLabelOf(role: unknown): string {
  return ROLE_IDS.includes(role as RoleId) ? TH.role[role as RoleId] : String(role ?? "");
}

function sentence(title: string, question: string): ToolCallDescription {
  return { title, question, details: [] };
}

/**
 * What a button press reads as in the user's own bubble: one sentence, no payload — the decision card that follows
 * carries the subject, the ask and what approving does, so repeating them here would say everything twice.
 */
export const describeCopToolCall: DescribeToolCall = (name, input) => {
  const value = (input ?? {}) as Record<string, unknown>;
  const to = nameOf((value as Recipient).toUserId);
  if (name === "create_handoff") return sentence(TH.approve.handoffDone(to), TH.approve.handoff(to));
  if (name === "send_email") return sentence(TH.approve.emailDone(to), TH.approve.email(to));
  if (name === "pin_widget") return sentence(TH.approve.pinDone, TH.approve.pin);
  if (name === "watch_metric") return sentence(TH.approve.watchDone, TH.approve.watch);
  if (name === "run_job") return sentence(TH.approve.jobDone(jobOf(value)), TH.approve.job(jobOf(value)));
  if (name === "set_permission") return sentence(TH.approve.permissionDone(roleLabelOf(value.role)), TH.approve.permission);
  return null;
};
