import { z } from "zod";
import type { Brand, Region } from "./identity";
import type { MetricId } from "./semantic";

export const GRANT_DAYS = [1, 3, 7] as const;
/** How long a temporary grant lasts. */
export type GrantDays = (typeof GRANT_DAYS)[number];
export const DEFAULT_GRANT_DAYS: GrantDays = 3;
export const grantDaysSchema = z.literal(GRANT_DAYS);

/** What a grant opens: one metric, within these regions and brands. */
export type GrantSlice = { metric: MetricId; regions: Region[] | "all"; brands: Brand[] | "all" };

/** A grant as the access context carries it while it is live. */
export type ActiveGrant = { id: string; grantorId: string; slice: GrantSlice; expiresAt: string };

/** The grant one tool call used, as the audit names it. */
export type GrantRef = { id: string; grantorId: string; expiresAt: string };

/** A stored grant: who opened which slice to whom, for how long, from which share or request, and whether it was revoked. */
export type Grant = { id: string; grantorId: string; recipientId: string; slice: GrantSlice; days: GrantDays; shareCode: string | null; requestId: string | null;
  createdAt: string; expiresAt: string; revokedAt: string | null; revokedBy: string | null };

export type GrantRequestStatus = "pending" | "approved" | "declined";

/** A recipient's request for the slice a shared card hid from them, waiting on one approver. */
export type GrantRequest = { id: string; requesterId: string; approverId: string; slice: GrantSlice; shareCode: string; reason: string;
  status: GrantRequestStatus; createdAt: string; decidedAt: string | null; grantId: string | null };

export const GRANT_REFUSAL_CODES = ["sensitive", "self", "not_authority", "beyond_scope", "masked", "nothing_hidden", "policy_rule"] as const;
export type GrantRefusalCode = (typeof GRANT_REFUSAL_CODES)[number];

/** Why a grant cannot be given; a CEL rule names itself. */
export type GrantRefusal = { code: Exclude<GrantRefusalCode, "policy_rule"> } | { code: "policy_rule"; rule: { id: string; name: string } };

/** What a shared card hides from its viewer and where they stand on getting it: their live grant, their pending request, or whether anyone may approve one. */
export type ShareScope = { hidden: GrantSlice; grant: { expiresAt: string; grantorName: string } | null; pendingRequest: { id: string; approverName: string } | null; requestable: boolean };
